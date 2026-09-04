import type { FastifyInstance, FastifyReply } from 'fastify';
import type { TicketSource } from '../ado/service.ts';

interface ProjectParams {
  project: string;
}
interface TeamParams extends ProjectParams {
  team: string;
}
interface BoardParams extends TeamParams {
  boardId: string;
}
interface WorkItemParams extends ProjectParams {
  id: string;
}

function parseWorkItemId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function registerAdoRoutes(app: FastifyInstance, source: TicketSource): Promise<void> {
  app.get('/api/projects', async (_request, reply) => source.listProjects(toSignal(reply)));

  app.get<{ Params: ProjectParams }>('/api/projects/:project/teams', async (request, reply) =>
    source.listTeams(request.params.project, toSignal(reply)),
  );

  app.get<{ Params: TeamParams }>('/api/projects/:project/teams/:team/boards', async (request, reply) =>
    source.listBoards(request.params.project, request.params.team, toSignal(reply)),
  );

  app.get<{ Params: BoardParams; Querystring: { includeClosed?: string } }>(
    '/api/projects/:project/teams/:team/boards/:boardId',
    async (request, reply) =>
      source.getBoard(request.params.project, request.params.team, request.params.boardId, {
        includeClosed: request.query.includeClosed === 'true',
        signal: toSignal(reply),
      }),
  );

  app.get<{ Params: WorkItemParams }>('/api/projects/:project/workitems/:id', async (request, reply) => {
    const id = parseWorkItemId(request.params.id);
    if (id === null) return reply.code(400).send({ error: 'Work item id must be a positive integer' });
    return source.getWorkItem(request.params.project, id, toSignal(reply));
  });

  app.get<{ Params: WorkItemParams }>(
    '/api/projects/:project/workitems/:id/comments',
    async (request, reply) => {
      const id = parseWorkItemId(request.params.id);
      if (id === null) return reply.code(400).send({ error: 'Work item id must be a positive integer' });
      return source.listComments(request.params.project, id, toSignal(reply));
    },
  );

  /** Pull-to-refresh: drop cached reads so the next fetch really hits ADO. */
  app.post<{ Querystring: { prefix?: string } }>('/api/refresh', async (request) => {
    source.invalidate(request.query.prefix);
    return { ok: true };
  });
}

/**
 * Aborts the upstream ADO call when the phone navigates away mid-request —
 * otherwise a flaky mobile connection leaves work in flight for every tap.
 *
 * The writableFinished check matters: 'close' also fires on a normal response,
 * and aborting there would fire after every single successful request.
 */
function toSignal(reply: FastifyReply): AbortSignal {
  const controller = new AbortController();
  reply.raw.on('close', () => {
    if (!reply.raw.writableFinished) controller.abort();
  });
  return controller.signal;
}
