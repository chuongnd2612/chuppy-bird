import { Readable } from 'node:stream';

import type { FastifyInstance } from 'fastify';

import { fetchAttachment } from '../ado/attachments.ts';
import type { AdoClient } from '../ado/client.ts';
import { assertNotSignInPage } from '../ado/client.ts';
import { AdoError } from '../ado/errors.ts';
import { adoBaseUrl } from '../config.ts';

/** Attachments never change once uploaded, so let the phone keep them. */
const IMMUTABLE = 'private, max-age=604800, immutable';
const GUID_OR_ID = /^[0-9a-fA-F-]{1,64}$/;

/**
 * Serves the bytes behind the URLs html.ts rewrote. Without these two routes
 * every screenshot and avatar in every ticket renders broken, because the raw
 * ADO URLs need the PAT the browser does not have.
 */
export async function registerMediaRoutes(app: FastifyInstance, client: AdoClient): Promise<void> {
  const adoOrigin = new URL(adoBaseUrl(app.config)).origin;

  app.get<{ Params: { id: string }; Querystring: { fileName?: string } }>(
    '/api/attachments/:id',
    async (request, reply) => {
      const { id } = request.params;
      if (!GUID_OR_ID.test(id)) {
        return reply.code(400).send({ error: 'Malformed attachment id' });
      }

      const attachment = await fetchAttachment(client, id, request.query.fileName ?? null);
      reply
        .header('content-type', attachment.contentType)
        .header('content-disposition', attachment.contentDisposition)
        .header('cache-control', IMMUTABLE)
        // The bytes come from a work item; never let the browser guess a type.
        .header('x-content-type-options', 'nosniff');
      if (attachment.contentLength) reply.header('content-length', attachment.contentLength);

      return reply.send(Readable.fromWeb(attachment.body as Parameters<typeof Readable.fromWeb>[0]));
    },
  );

  app.get<{ Querystring: { u?: string } }>('/api/avatar', async (request, reply) => {
    const target = request.query.u;
    if (!target) return reply.code(400).send({ error: 'Missing avatar URL' });

    // Only ever fetch from the configured collection. Without this check the
    // route is an open proxy that would happily fetch anything, with our PAT
    // attached.
    let parsed: URL;
    try {
      parsed = new URL(target);
    } catch {
      return reply.code(400).send({ error: 'Malformed avatar URL' });
    }
    if (parsed.origin !== adoOrigin) {
      return reply.code(403).send({ error: 'Avatar URL is not on the configured Azure DevOps host' });
    }

    const response = await client.requestRaw({
      path: parsed.pathname.replace(/^\//, '') + parsed.search,
    });
    assertNotSignInPage(response, { htmlIsSuspicious: false });
    if (!response.ok || !response.body) {
      throw new AdoError(`Could not fetch avatar (${response.status})`, 502);
    }

    reply
      .header('content-type', response.headers.get('content-type') ?? 'image/png')
      .header('cache-control', 'private, max-age=86400')
      .header('x-content-type-options', 'nosniff');
    return reply.send(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]));
  });
}
