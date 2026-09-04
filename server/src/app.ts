import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';

import type { Config } from './config.ts';

const here = dirname(fileURLToPath(import.meta.url));
/** Vite writes the SPA here; absent during `npm run dev`, where Vite serves it. */
export const WEB_DIST = resolve(here, '../../dist/web');

export interface AppOptions {
  config: Config;
  logger?: boolean;
}

export async function buildApp({ config, logger = true }: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger,
    // Attachment downloads stream through us; keep the body cap for JSON only.
    bodyLimit: 1024 * 1024,
    trustProxy: true,
  });

  app.decorate('config', config);

  app.get('/api/health', async () => ({
    ok: true,
    demoMode: config.DEMO_MODE,
  }));

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
