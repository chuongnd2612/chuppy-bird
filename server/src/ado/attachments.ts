import type { AdoClient } from './client.ts';
import { assertNotSignInPage } from './client.ts';
import { AdoError } from './errors.ts';

/**
 * Attachment bytes, fetched with the PAT and handed to the route to stream on.
 * Nothing is buffered in memory — a 20 MB screenshot recording should not sit
 * in the heap on its way to a phone.
 */

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8',
  log: 'text/plain; charset=utf-8',
  json: 'application/json',
  csv: 'text/csv',
  zip: 'application/zip',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
};

/**
 * Azure DevOps hands back `application/octet-stream` for nearly everything, so
 * the browser downloads screenshots instead of showing them. Recover the real
 * type from the filename.
 */
export function contentTypeFor(fileName: string | null, reported: string | null): string {
  const extension = fileName?.split('.').pop()?.toLowerCase();
  const known = extension ? MIME_BY_EXTENSION[extension] : undefined;
  if (known) return known;
  if (reported && reported !== 'application/octet-stream') return reported;
  return 'application/octet-stream';
}

/**
 * SVG is an executable document in a browser. Serving one inline from our own
 * origin would let a work item attachment run script against the app session,
 * so it is always sent as a download instead.
 */
export function dispositionFor(contentType: string, fileName: string | null): string {
  const name = fileName ?? 'attachment';
  const encoded = encodeURIComponent(name);
  const inline = contentType.startsWith('image/') && contentType !== 'image/svg+xml';
  const kind = inline || contentType === 'application/pdf' ? 'inline' : 'attachment';
  return `${kind}; filename*=UTF-8''${encoded}`;
}

export interface FetchedAttachment {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  contentDisposition: string;
  contentLength: string | null;
}

export async function fetchAttachment(
  client: AdoClient,
  id: string,
  fileName: string | null,
  signal?: AbortSignal,
): Promise<FetchedAttachment> {
  const response = await client.requestRaw({
    path: `_apis/wit/attachments/${encodeURIComponent(id)}`,
    query: { fileName: fileName ?? undefined, download: 'false' },
    signal,
  });

  // An .html attachment is a legitimate payload, so only the status code can
  // betray a sign-in page here.
  assertNotSignInPage(response, { htmlIsSuspicious: false });

  if (!response.ok) {
    throw new AdoError(
      `Could not fetch attachment ${id} (${response.status})`,
      response.status === 404 ? 404 : 502,
    );
  }
  if (!response.body) {
    throw new AdoError(`Attachment ${id} came back with no body`, 502);
  }

  const contentType = contentTypeFor(fileName, response.headers.get('content-type'));
  return {
    body: response.body,
    contentType,
    contentDisposition: dispositionFor(contentType, fileName),
    contentLength: response.headers.get('content-length'),
  };
}
