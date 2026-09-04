import type {
  AdoBoard,
  AdoBoardRef,
  AdoComment,
  AdoProject,
  AdoTeam,
  AdoWorkItem,
} from '../../../shared/types.ts';

/** An API failure carrying the server's hint, which is usually the actionable part. */
export class ApiFailure extends Error {
  readonly status: number;
  readonly hint: string | undefined;

  constructor(message: string, status: number, hint?: string) {
    super(message);
    this.name = 'ApiFailure';
    this.status = status;
    this.hint = hint;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { Accept: 'application/json', ...init.headers },
    credentials: 'same-origin',
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    let hint: string | undefined;
    try {
      const body = (await response.json()) as { error?: string; hint?: string };
      if (body.error) message = body.error;
      hint = body.hint;
    } catch {
      // A non-JSON error body tells us nothing more than the status did.
    }
    throw new ApiFailure(message, response.status, hint);
  }

  return (await response.json()) as T;
}

export const api = {
  authStatus: () => request<{ authRequired: boolean }>('/api/auth/status'),

  login: (password: string) =>
    request<{ ok: true }>('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    }),

  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),

  projects: () => request<AdoProject[]>('/api/projects'),

  teams: (project: string) => request<AdoTeam[]>(`/api/projects/${encodeURIComponent(project)}/teams`),

  boards: (project: string, team: string) =>
    request<AdoBoardRef[]>(
      `/api/projects/${encodeURIComponent(project)}/teams/${encodeURIComponent(team)}/boards`,
    ),

  board: (project: string, team: string, boardId: string, includeClosed = false) =>
    request<AdoBoard>(
      `/api/projects/${encodeURIComponent(project)}/teams/${encodeURIComponent(team)}` +
        `/boards/${encodeURIComponent(boardId)}?includeClosed=${includeClosed}`,
    ),

  workItem: (project: string, id: number) =>
    request<AdoWorkItem>(`/api/projects/${encodeURIComponent(project)}/workitems/${id}`),

  comments: (project: string, id: number) =>
    request<AdoComment[]>(`/api/projects/${encodeURIComponent(project)}/workitems/${id}/comments`),

  refresh: (prefix?: string) =>
    request<{ ok: true }>(`/api/refresh${prefix ? `?prefix=${encodeURIComponent(prefix)}` : ''}`, {
      method: 'POST',
    }),
};
