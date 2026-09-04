import type {
  AdoBoard,
  AdoBoardColumn,
  AdoBoardRef,
  AdoComment,
  AdoProject,
  AdoTeam,
  AdoWorkItem,
} from '../../../shared/types.ts';
import { adoBaseUrl, type Config } from '../config.ts';
import { TtlCache } from './cache.ts';
import type { AdoClient } from './client.ts';
import { AdoError } from './errors.ts';
import { CARD_FIELDS } from './fields.ts';
import { renderAdoHtml } from './html.ts';
import { toCard, toIdentity, toWorkItem, type RawWorkItem } from './mappers.ts';

/** ADO refuses a workitemsbatch call carrying more than 200 ids. */
const BATCH_LIMIT = 200;
/** How many cards to pull for a board. Beyond this a phone is not the tool. */
const BOARD_ITEM_LIMIT = 400;
/** Comments are a preview API even on 7.1. */
const COMMENTS_API_VERSION = '7.1-preview.4';

/** States that mean "off the board" unless the caller asks for them. */
const DONE_STATES = ['Closed', 'Done', 'Completed', 'Cut'];

/**
 * Turns what the user typed into the HTML Azure DevOps stores.
 *
 * ADO comments are an HTML field. Posting raw input would let a comment carry
 * markup — or script — into every client that renders the thread, including the
 * real ADO web UI. Escape first, then add only the line breaks back.
 */
export function textToAdoHtml(text: string): string {
  const escaped = text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

  return escaped
    .split(/\r?\n/)
    .map((line) => (line.trim() ? `<div>${line}</div>` : '<div><br></div>'))
    .join('');
}

interface ListResponse<T> {
  count?: number;
  value?: T[];
}

/**
 * What the routes depend on, so DEMO_MODE can swap in fixtures without the
 * route layer knowing which one it is talking to.
 */
export interface TicketSource {
  listProjects(signal?: AbortSignal): Promise<AdoProject[]>;
  listTeams(project: string, signal?: AbortSignal): Promise<AdoTeam[]>;
  listBoards(project: string, team: string, signal?: AbortSignal): Promise<AdoBoardRef[]>;
  getBoard(project: string, team: string, boardId: string, options?: BoardOptions): Promise<AdoBoard>;
  getWorkItem(project: string, id: number, signal?: AbortSignal): Promise<AdoWorkItem>;
  listComments(project: string, id: number, signal?: AbortSignal): Promise<AdoComment[]>;
  addComment(project: string, id: number, text: string, signal?: AbortSignal): Promise<AdoComment>;
  invalidate(prefix?: string): void;
}

/** Longest comment Azure DevOps accepts. */
export const MAX_COMMENT_LENGTH = 30_000;

export interface BoardOptions {
  includeClosed?: boolean;
  signal?: AbortSignal;
}

/**
 * The read model behind every screen. Everything is cached briefly: reopening a
 * board on a phone otherwise costs a WIQL query plus a batch fetch each time.
 */
export class AdoService implements TicketSource {
  readonly #client: AdoClient;
  readonly #origin: string;
  readonly #cache: TtlCache<unknown>;

  constructor(client: AdoClient, config: Config, cache?: TtlCache<unknown>) {
    this.#client = client;
    this.#origin = new URL(adoBaseUrl(config)).origin;
    this.#cache = cache ?? new TtlCache<unknown>(config.CACHE_TTL_SECONDS);
  }

  /** Drops cached reads so a pull-to-refresh actually re-fetches. */
  invalidate(prefix?: string): void {
    this.#cache.clear(prefix);
  }

  async #cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.#cache.get(key) as T | undefined;
    if (hit !== undefined) return hit;
    const value = await load();
    this.#cache.set(key, value);
    return value;
  }

  async listProjects(signal?: AbortSignal): Promise<AdoProject[]> {
    return this.#cached('projects', async () => {
      const response = await this.#client.requestJson<
        ListResponse<{ id: string; name: string; description?: string }>
      >({ path: '_apis/projects', query: { $top: 500 }, signal });

      return (response.value ?? [])
        .map((project) => ({
          id: project.id,
          name: project.name,
          description: project.description ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  async listTeams(project: string, signal?: AbortSignal): Promise<AdoTeam[]> {
    return this.#cached(`teams:${project}`, async () => {
      const response = await this.#client.requestJson<ListResponse<{ id: string; name: string }>>({
        path: `_apis/projects/${encodeURIComponent(project)}/teams`,
        query: { $top: 200 },
        signal,
      });
      return (response.value ?? []).map((team) => ({ id: team.id, name: team.name }));
    });
  }

  async listBoards(project: string, team: string, signal?: AbortSignal): Promise<AdoBoardRef[]> {
    return this.#cached(`boards:${project}:${team}`, async () => {
      const response = await this.#client.requestJson<ListResponse<{ id: string; name: string }>>({
        path: `${encodeURIComponent(project)}/${encodeURIComponent(team)}/_apis/work/boards`,
        signal,
      });
      return (response.value ?? []).map((board) => ({ id: board.id, name: board.name }));
    });
  }

  async getBoard(
    project: string,
    team: string,
    boardId: string,
    { includeClosed = false, signal }: BoardOptions = {},
  ): Promise<AdoBoard> {
    const key = `board:${project}:${team}:${boardId}:${includeClosed}`;
    return this.#cached(key, async () => {
      const [board, cards] = await Promise.all([
        this.#client.requestJson<{
          id: string;
          name: string;
          columns?: Array<{ id: string; name: string; itemLimit?: number }>;
        }>({
          path: `${encodeURIComponent(project)}/${encodeURIComponent(team)}/_apis/work/boards/${encodeURIComponent(boardId)}`,
          signal,
        }),
        this.#boardCards(project, team, includeClosed, signal),
      ]);

      const columns: AdoBoardColumn[] = (board.columns ?? []).map((column, index) => ({
        id: column.id,
        name: column.name,
        order: index,
        itemLimit: column.itemLimit ?? 0,
      }));

      // Cards whose column the board does not define are kept as-is; the UI
      // groups them under "Other" rather than dropping them silently.
      return { id: board.id, name: board.name, columns, cards };
    });
  }

  async #boardCards(project: string, team: string, includeClosed: boolean, signal?: AbortSignal) {
    const excluded = includeClosed ? ['Removed'] : ['Removed', ...DONE_STATES];
    const states = excluded.map((state) => `'${state}'`).join(', ');
    const query = [
      'SELECT [System.Id] FROM WorkItems',
      'WHERE [System.TeamProject] = @project',
      `AND [System.State] NOT IN (${states})`,
      'ORDER BY [System.ChangedDate] DESC',
    ].join(' ');

    const result = await this.#client.requestJson<{ workItems?: Array<{ id: number }> }>({
      path: `${encodeURIComponent(project)}/${encodeURIComponent(team)}/_apis/wit/wiql`,
      method: 'POST',
      query: { $top: BOARD_ITEM_LIMIT },
      body: { query },
      signal,
    });

    const ids = (result.workItems ?? []).map((item) => item.id);
    const raw = await this.#batchWorkItems(project, ids, CARD_FIELDS, signal);
    return raw.map((item) => toCard(item, this.#origin));
  }

  async #batchWorkItems(
    project: string,
    ids: number[],
    fields: string[],
    signal?: AbortSignal,
  ): Promise<RawWorkItem[]> {
    const items: RawWorkItem[] = [];
    for (let start = 0; start < ids.length; start += BATCH_LIMIT) {
      const chunk = ids.slice(start, start + BATCH_LIMIT);
      const response = await this.#client.requestJson<ListResponse<RawWorkItem>>({
        path: `${encodeURIComponent(project)}/_apis/wit/workitemsbatch`,
        method: 'POST',
        body: { ids: chunk, fields },
        signal,
      });
      items.push(...(response.value ?? []));
    }
    return items;
  }

  async getWorkItem(project: string, id: number, signal?: AbortSignal): Promise<AdoWorkItem> {
    return this.#cached(`workitem:${project}:${id}`, async () => {
      // $expand=all is what carries relations, and therefore attachments.
      const raw = await this.#client.requestJson<RawWorkItem>({
        path: `${encodeURIComponent(project)}/_apis/wit/workitems/${id}`,
        query: { $expand: 'all' },
        signal,
      });
      return toWorkItem(raw, this.#origin);
    });
  }

  /**
   * Posts a comment. This is the only write the app performs, and it needs a
   * PAT with Work Items (Read & Write) — a read-only PAT fails here alone.
   */
  async addComment(project: string, id: number, text: string, signal?: AbortSignal): Promise<AdoComment> {
    const trimmed = text.trim();
    if (!trimmed) throw new AdoError('A comment cannot be empty', 400);
    if (trimmed.length > MAX_COMMENT_LENGTH) {
      throw new AdoError(`A comment cannot exceed ${MAX_COMMENT_LENGTH} characters`, 400);
    }

    const created = await this.#client.requestJson<{
      id: number;
      text?: string;
      createdBy?: unknown;
      createdDate?: string;
    }>({
      path: `${encodeURIComponent(project)}/_apis/wit/workItems/${id}/comments`,
      method: 'POST',
      apiVersion: COMMENTS_API_VERSION,
      body: { text: textToAdoHtml(trimmed) },
      signal,
    });

    // The thread and the work item's changed date are both stale now.
    this.#cache.clear(`comments:${project}:${id}`);
    this.#cache.clear(`workitem:${project}:${id}`);

    return {
      id: created.id,
      html: renderAdoHtml(created.text ?? null) ?? '',
      createdBy: toIdentity(created.createdBy, this.#origin) ?? {
        id: null,
        displayName: 'You',
        avatarUrl: null,
      },
      createdDate: created.createdDate ?? new Date().toISOString(),
      modifiedDate: null,
    };
  }

  async listComments(project: string, id: number, signal?: AbortSignal): Promise<AdoComment[]> {
    return this.#cached(`comments:${project}:${id}`, async () => {
      const response = await this.#client.requestJson<{
        comments?: Array<{
          id: number;
          text?: string;
          createdBy?: unknown;
          createdDate?: string;
          modifiedDate?: string;
        }>;
      }>({
        path: `${encodeURIComponent(project)}/_apis/wit/workItems/${id}/comments`,
        query: { $top: 200 },
        apiVersion: COMMENTS_API_VERSION,
        signal,
      });

      return (response.comments ?? [])
        .map((comment) => ({
          id: comment.id,
          html: renderAdoHtml(comment.text ?? null) ?? '',
          createdBy: toIdentity(comment.createdBy, this.#origin) ?? {
            id: null,
            displayName: 'Unknown',
            avatarUrl: null,
          },
          createdDate: comment.createdDate ?? new Date(0).toISOString(),
          modifiedDate: comment.modifiedDate ?? null,
        }))
        .filter((comment) => comment.html.length > 0)
        .sort((a, b) => a.createdDate.localeCompare(b.createdDate));
    });
  }
}
