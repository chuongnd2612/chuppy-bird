import type { FastifyInstance } from 'fastify';
// Side-effect import: pulls in the cookie/unsignCookie declarations on the
// Fastify request and reply types.
import type {} from '@fastify/cookie';
import { SESSION_COOKIE, decodeSession, encodeSession, passwordMatches } from '../auth/session.ts';

/** Paths reachable without a session, so the login screen can load and submit. */
const PUBLIC_PATHS = new Set(['/api/health', '/api/auth/login', '/api/auth/status']);

export async function registerAuth(app: FastifyInstance): Promise<void> {
  const { APP_PASSWORD, SESSION_TTL_HOURS } = app.config;
  const authRequired = APP_PASSWORD.length > 0;

  app.addHook('onRequest', async (request, reply) => {
    if (!authRequired) return;
    if (!request.url.startsWith('/api/')) return;
    const path = request.url.split('?')[0] ?? '';
    if (PUBLIC_PATHS.has(path)) return;

    const cookie = request.cookies[SESSION_COOKIE];
    const unsigned = cookie ? request.unsignCookie(cookie) : null;
    if (!unsigned?.valid || !decodeSession(unsigned.value ?? undefined)) {
      return reply.code(401).send({ error: 'Not signed in' });
    }
  });

  app.get('/api/auth/status', async () => ({ authRequired }));

  app.post<{ Body: { password?: string } }>('/api/auth/login', async (request, reply) => {
    if (!authRequired) return { ok: true };

    const supplied = request.body?.password ?? '';
    if (!passwordMatches(supplied, APP_PASSWORD)) {
      // Deliberately vague, and logged so a burst of these is visible.
      request.log.warn({ ip: request.ip }, 'failed sign-in attempt');
      return reply.code(401).send({ error: 'Wrong password' });
    }

    const ttlMs = SESSION_TTL_HOURS * 60 * 60 * 1000;
    return reply
      .setCookie(SESSION_COOKIE, encodeSession(Date.now() + ttlMs), {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        // 'auto' keeps this working over plain http on a LAN while still
        // setting Secure once it is served over https.
        secure: 'auto',
        signed: true,
        maxAge: Math.floor(ttlMs / 1000),
      })
      .send({ ok: true });
  });

  app.post('/api/auth/logout', async (_request, reply) =>
    reply.clearCookie(SESSION_COOKIE, { path: '/' }).send({ ok: true }),
  );
}
