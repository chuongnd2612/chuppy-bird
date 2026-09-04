import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.ts';
import { loadConfig } from '../config.ts';
import { DemoSource } from '../ado/demoSource.ts';
import { AdoError } from '../ado/errors.ts';
import type { TicketSource } from '../ado/service.ts';

const BASE_ENV = {
  DEMO_MODE: 'true',
  SESSION_SECRET: 's'.repeat(32),
};

async function appWith(env: Record<string, string> = {}, source?: TicketSource) {
  const { config } = loadConfig({ ...BASE_ENV, ...env });
  return buildApp({ config, logger: false, source: source ?? new DemoSource() });
}

/**
 * A DemoSource with some methods replaced. Object.assign is deliberate: a
 * spread would copy no prototype methods, leaving an object that only looks
 * like a TicketSource.
 */
function sourceWith(overrides: Partial<TicketSource>): TicketSource {
  return Object.assign(new DemoSource(), overrides);
}

/** Signs in and returns the cookie header for subsequent requests. */
async function signIn(app: Awaited<ReturnType<typeof buildApp>>, password: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { password },
  });
  return response.headers['set-cookie'] as string | undefined;
}

describe('authentication', () => {
  it('rejects API access without a session when a password is set', async () => {
    const app = await appWith({ APP_PASSWORD: 'hunter2' });
    const response = await app.inject({ method: 'GET', url: '/api/projects' });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('lets the login and status endpoints through unauthenticated', async () => {
    const app = await appWith({ APP_PASSWORD: 'hunter2' });
    expect((await app.inject({ method: 'GET', url: '/api/auth/status' })).json()).toEqual({
      authRequired: true,
    });
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
    await app.close();
  });

  it('rejects the wrong password and accepts the right one', async () => {
    const app = await appWith({ APP_PASSWORD: 'hunter2' });
    expect(
      (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { password: 'nope' } }))
        .statusCode,
    ).toBe(401);

    const cookie = await signIn(app, 'hunter2');
    expect(cookie).toBeDefined();

    const response = await app.inject({ method: 'GET', url: '/api/projects', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it('marks the session cookie httpOnly so script cannot read it', async () => {
    const app = await appWith({ APP_PASSWORD: 'hunter2' });
    expect(await signIn(app, 'hunter2')).toMatch(/HttpOnly/i);
    await app.close();
  });

  it('rejects a forged cookie that was not signed by us', async () => {
    const app = await appWith({ APP_PASSWORD: 'hunter2' });
    const forged = `ado_session=${Date.now() + 60_000}.badsignature`;
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: { cookie: forged },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('is open when no password is configured', async () => {
    const app = await appWith({ APP_PASSWORD: '' });
    expect((await app.inject({ method: 'GET', url: '/api/projects' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/auth/status' })).json()).toEqual({
      authRequired: false,
    });
    await app.close();
  });
});

describe('ADO routes', () => {
  it('lists projects, boards and a work item with its comments', async () => {
    const app = await appWith();

    const projects = await app.inject({ method: 'GET', url: '/api/projects' });
    expect(projects.json()).toHaveLength(2);

    const board = await app.inject({
      method: 'GET',
      url: '/api/projects/Payments/teams/Payments%20Team/boards/b1',
    });
    expect(board.json()).toMatchObject({ name: 'Payments Team' });
    expect(board.json().columns).toHaveLength(4);

    const item = await app.inject({ method: 'GET', url: '/api/projects/Payments/workitems/1042' });
    expect(item.json()).toMatchObject({ id: 1042, workItemType: 'Bug' });

    const comments = await app.inject({
      method: 'GET',
      url: '/api/projects/Payments/workitems/1042/comments',
    });
    expect(comments.json()).toHaveLength(2);
    await app.close();
  });

  it('rejects a non-numeric work item id', async () => {
    const app = await appWith();
    const response = await app.inject({ method: 'GET', url: '/api/projects/P/workitems/abc' });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('reports a missing work item as 404 with the ADO message', async () => {
    const app = await appWith();
    const response = await app.inject({ method: 'GET', url: '/api/projects/P/workitems/99999' });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toMatch(/99999/);
    await app.close();
  });
});

describe('posting a comment', () => {
  it('creates a comment and returns it', async () => {
    const app = await appWith();
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/Payments/workitems/1042/comments',
      payload: { text: 'Looks right to me' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ createdBy: { displayName: 'You' } });
    expect(response.json().html).toContain('Looks right to me');
    await app.close();
  });

  it('shows up in the thread afterwards', async () => {
    const app = await appWith();
    await app.inject({
      method: 'POST',
      url: '/api/projects/Payments/workitems/1042/comments',
      payload: { text: 'Second pass' },
    });

    const thread = await app.inject({
      method: 'GET',
      url: '/api/projects/Payments/workitems/1042/comments',
    });
    expect(thread.json()).toHaveLength(3);
    await app.close();
  });

  it('rejects an empty or missing body', async () => {
    const app = await appWith();
    for (const payload of [{ text: '   ' }, {}, { text: 42 }]) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/projects/Payments/workitems/1042/comments',
        payload,
      });
      expect(response.statusCode).toBe(400);
    }
    await app.close();
  });

  it('rejects a non-numeric work item id', async () => {
    const app = await appWith();
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/P/workitems/abc/comments',
      payload: { text: 'hi' },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('requires a session, like every other write', async () => {
    const app = await appWith({ APP_PASSWORD: 'hunter2' });
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/P/workitems/1/comments',
      payload: { text: 'hi' },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('stores escaped markup, never live HTML', async () => {
    const app = await appWith();
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/Payments/workitems/1042/comments',
      payload: { text: '<img src=x onerror=alert(1)>' },
    });

    expect(response.json().html).not.toContain('<img');
    expect(response.json().html).toContain('&lt;img');
    await app.close();
  });
});

describe('error handling', () => {
  it('surfaces the PAT hint on an auth failure', async () => {
    const failing = sourceWith({
      listProjects: async () => {
        throw new AdoError('PAT rejected', 401, 'Check the PAT scopes.');
      },
    });
    const app = await appWith({}, failing);
    const response = await app.inject({ method: 'GET', url: '/api/projects' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'PAT rejected', hint: 'Check the PAT scopes.' });
    await app.close();
  });

  it('does not leak internals from an unexpected error', async () => {
    const failing = sourceWith({
      listProjects: async () => {
        throw new Error('connect ECONNREFUSED 10.0.0.5:8080');
      },
    });
    const app = await appWith({}, failing);
    const response = await app.inject({ method: 'GET', url: '/api/projects' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'Internal server error' });
    await app.close();
  });
});

describe('refresh', () => {
  it('invalidates cached reads', async () => {
    let cleared: string | undefined | 'none' = 'none';
    const source = sourceWith({
      invalidate: (prefix?: string) => {
        cleared = prefix;
      },
    });
    const app = await appWith({}, source);
    const response = await app.inject({ method: 'POST', url: '/api/refresh?prefix=board:' });

    expect(response.json()).toEqual({ ok: true });
    expect(cleared).toBe('board:');
    await app.close();
  });
});
