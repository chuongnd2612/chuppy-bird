import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../config.ts';
import type { AdoClient, AdoRequestOptions } from './client.ts';
import { FIELD } from './fields.ts';
import { AdoService } from './service.ts';

const { config } = loadConfig({
  ADO_BASE_URL: 'https://dev.azure.com/acme',
  ADO_PAT: 'pat',
  APP_PASSWORD: 'pw',
  SESSION_SECRET: 's'.repeat(32),
  CACHE_TTL_SECONDS: '60',
});

type Handler = (options: AdoRequestOptions) => unknown;

/** A stand-in AdoClient that routes by path fragment. */
function fakeClient(routes: Array<[RegExp, Handler]>) {
  const requestJson = vi.fn(async (options: AdoRequestOptions) => {
    for (const [pattern, handler] of routes) {
      if (pattern.test(options.path)) return handler(options);
    }
    throw new Error(`Unhandled path: ${options.path}`);
  });
  return { client: { requestJson } as unknown as AdoClient, requestJson };
}

describe('listProjects', () => {
  it('maps and sorts projects by name', async () => {
    const { client } = fakeClient([
      [/_apis\/projects$/, () => ({ value: [{ id: '2', name: 'Platform' }, { id: '1', name: 'Payments', description: 'd' }] })],
    ]);
    const projects = await new AdoService(client, config).listProjects();
    expect(projects.map((p) => p.name)).toEqual(['Payments', 'Platform']);
    expect(projects[0]?.description).toBe('d');
    expect(projects[1]?.description).toBeNull();
  });

  it('caches, so reopening the list does not re-query ADO', async () => {
    const { client, requestJson } = fakeClient([[/_apis\/projects$/, () => ({ value: [] })]]);
    const service = new AdoService(client, config);
    await service.listProjects();
    await service.listProjects();
    expect(requestJson).toHaveBeenCalledTimes(1);

    service.invalidate();
    await service.listProjects();
    expect(requestJson).toHaveBeenCalledTimes(2);
  });

  it('tolerates a response with no value array', async () => {
    const { client } = fakeClient([[/_apis\/projects$/, () => ({})]]);
    expect(await new AdoService(client, config).listProjects()).toEqual([]);
  });
});

describe('getBoard', () => {
  const boardRoutes = (workItemIds: number[]): Array<[RegExp, Handler]> => [
    [
      /_apis\/work\/boards\//,
      () => ({ id: 'b1', name: 'Team Board', columns: [{ id: 'c1', name: 'New' }, { id: 'c2', name: 'Doing', itemLimit: 5 }] }),
    ],
    [/_apis\/wit\/wiql$/, () => ({ workItems: workItemIds.map((id) => ({ id })) })],
    [
      /workitemsbatch$/,
      (options) => {
        const ids = (options.body as { ids: number[] }).ids;
        return {
          value: ids.map((id) => ({
            id,
            fields: { [FIELD.title]: `Item ${id}`, [FIELD.boardColumn]: 'Doing', [FIELD.state]: 'Active' },
          })),
        };
      },
    ],
  ];

  it('returns ordered columns and their cards', async () => {
    const { client } = fakeClient(boardRoutes([10, 11]));
    const board = await new AdoService(client, config).getBoard('Payments', 'Team', 'b1');

    expect(board.columns.map((c) => [c.name, c.order, c.itemLimit])).toEqual([
      ['New', 0, 0],
      ['Doing', 1, 5],
    ]);
    expect(board.cards.map((c) => c.id)).toEqual([10, 11]);
  });

  it('excludes done states by default and includes them on request', async () => {
    const { client, requestJson } = fakeClient(boardRoutes([]));
    const service = new AdoService(client, config);

    await service.getBoard('P', 'T', 'b1');
    const defaultQuery = requestJson.mock.calls.map((c) => c[0]).find((o) => o.path.endsWith('wiql'));
    expect((defaultQuery?.body as { query: string }).query).toContain("'Closed'");

    await service.getBoard('P', 'T', 'b1', { includeClosed: true });
    const openQuery = requestJson.mock.calls.map((c) => c[0]).filter((o) => o.path.endsWith('wiql')).at(-1);
    expect((openQuery?.body as { query: string }).query).not.toContain("'Closed'");
  });

  it('chunks the batch fetch at ADO 200-id limit', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => i + 1);
    const { client, requestJson } = fakeClient(boardRoutes(ids));
    const board = await new AdoService(client, config).getBoard('P', 'T', 'b1');

    const batchCalls = requestJson.mock.calls.map((c) => c[0]).filter((o) => o.path.endsWith('workitemsbatch'));
    expect(batchCalls).toHaveLength(3);
    expect((batchCalls[0]?.body as { ids: number[] }).ids).toHaveLength(200);
    expect((batchCalls[2]?.body as { ids: number[] }).ids).toHaveLength(50);
    expect(board.cards).toHaveLength(450);
  });

  it('scopes the WIQL to the team so team area paths apply', async () => {
    const { client, requestJson } = fakeClient(boardRoutes([]));
    await new AdoService(client, config).getBoard('Payments', 'Payments Team', 'b1');
    const wiql = requestJson.mock.calls.map((c) => c[0]).find((o) => o.path.endsWith('wiql'));
    expect(wiql?.path).toBe('Payments/Payments%20Team/_apis/wit/wiql');
  });
});

describe('getWorkItem', () => {
  it('expands relations so attachments come back', async () => {
    const { client, requestJson } = fakeClient([
      [/_apis\/wit\/workitems\/\d+$/, () => ({ id: 5, fields: { [FIELD.title]: 'T' }, relations: [] })],
    ]);
    const item = await new AdoService(client, config).getWorkItem('P', 5);

    expect(item.id).toBe(5);
    expect(requestJson.mock.calls[0]?.[0].query).toMatchObject({ $expand: 'all' });
  });
});

describe('listComments', () => {
  it('sanitizes, orders oldest first, and drops empty comments', async () => {
    const { client, requestJson } = fakeClient([
      [
        /comments$/,
        () => ({
          comments: [
            { id: 2, text: '<p>second</p>', createdDate: '2026-09-02T00:00:00Z', createdBy: { displayName: 'Mai' } },
            { id: 1, text: '<p>first<script>x()</script></p>', createdDate: '2026-09-01T00:00:00Z', createdBy: { displayName: 'Hao' } },
            { id: 3, text: '<p>&nbsp;</p>', createdDate: '2026-09-03T00:00:00Z' },
          ],
        }),
      ],
    ]);

    const comments = await new AdoService(client, config).listComments('P', 5);
    expect(comments.map((c) => c.id)).toEqual([1, 2]);
    expect(comments[0]?.html).not.toContain('script');
    expect(comments[0]?.createdBy.displayName).toBe('Hao');
    expect(requestJson.mock.calls[0]?.[0].apiVersion).toBe('7.1-preview.4');
  });

  it('names an unknown author rather than failing', async () => {
    const { client } = fakeClient([
      [/comments$/, () => ({ comments: [{ id: 1, text: '<p>hi</p>', createdDate: '2026-01-01T00:00:00Z' }] })],
    ]);
    const [comment] = await new AdoService(client, config).listComments('P', 5);
    expect(comment?.createdBy.displayName).toBe('Unknown');
  });
});
