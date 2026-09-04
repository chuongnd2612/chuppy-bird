import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';

import { AdoClient } from './ado/client.ts';
import { DemoSource } from './ado/demoSource.ts';
import { AdoError } from './ado/errors.ts';
import { AdoService, type TicketSource } from './ado/service.ts';
import { generateSecret } from './auth/session.ts';
import type { Config } from './config.ts';
import { registerAdoRoutes } from './routes/ado.ts';
import { registerAiRoutes } from './routes/ai.ts';
import { registerAuth } from './routes/auth.ts';
import { registerDemoMediaRoutes } from './routes/demoMedia.ts';
import { registerMediaRoutes } from './routes/media.ts';

const here = dirname(fileURLToPath(import.meta.url));
/** Vite writes the SPA here; absent during `npm run dev`, where Vite serves it. */
export const WEB_DIST = resolve(here, '../../dist/web');

export interface AppOptions {
  config: Config;
  logger?: boolean;
  /** Overridden in tests; otherwise chosen from DEMO_MODE. */
  source?: TicketSource;
  /** Overridden in tests; otherwise built from the PAT unless in demo mode. */
  client?: AdoClient;
}

export async function buildApp({ config, logger = true, source, client }: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger,
    // Attachment downloads stream through us; keep the body cap for JSON only.
    bodyLimit: 1024 * 1024,
    trustProxy: true,
  });

  app.decorate('config', config);

  await app.register(fastifyCookie, { secret: config.SESSION_SECRET || generateSecret() });

  app.get('/api/health', async () => ({
    ok: true,
    demoMode: config.DEMO_MODE,
  }));

  await registerAuth(app);

  const adoClient = client ?? (config.DEMO_MODE ? null : new AdoClient({ config }));
  const ticketSource =
    source ?? (adoClient ? new AdoService(adoClient, config) : new DemoSource());
  await registerAdoRoutes(app, ticketSource);
  await registerAiRoutes(app, ticketSource);

  // Demo mode has no PAT to proxy with, so it synthesises placeholder media
  // rather than showing the broken images a missing route would produce.
  if (adoClient) await registerMediaRoutes(app, adoClient);
  else await registerDemoMediaRoutes(app);

  // Turn an ADO failure into an honest reply instead of a bare 500. The hint is
  // the part that tells the user their PAT expired rather than "request failed".
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AdoError) {
      request.log.warn({ err: error, status: error.status }, 'azure devops request failed');
      return reply.code(error.status).send({ error: error.message, ...(error.hint ? { hint: error.hint } : {}) });
    }
    request.log.error({ err: error }, 'unhandled error');
    const fastifyError = error as { statusCode?: number; message?: string };
    const status =
      fastifyError.statusCode && fastifyError.statusCode >= 400 ? fastifyError.statusCode : 500;
    return reply
      .code(status)
      .send({ error: status === 500 ? 'Internal server error' : (fastifyError.message ?? 'Request failed') });
  });

  if (existsSync(WEB_DIST)) {
    await app.register(fastifyStatic, { root: WEB_DIST });
    // Client-side routing: any non-API path that is not a real file is the SPA.
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    config: Config;
  }
}
