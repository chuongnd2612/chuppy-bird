import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../config.ts';
import { AdoClient, assertNotSignInPage } from './client.ts';
import { contentTypeFor, dispositionFor, fetchAttachment } from './attachments.ts';

const { config } = loadConfig({
  ADO_BASE_URL: 'https://dev.azure.com/acme',
  ADO_PAT: 'pat',
  APP_PASSWORD: 'pw',
  SESSION_SECRET: 's'.repeat(32),
});

describe('contentTypeFor', () => {
  it('recovers the real type from the filename when ADO says octet-stream', () => {
    expect(contentTypeFor('shot.PNG', 'application/octet-stream')).toBe('image/png');
    expect(contentTypeFor('report.pdf', 'application/octet-stream')).toBe('application/pdf');
  });

  it('trusts a specific type ADO did report', () => {
    expect(contentTypeFor('weird.xyz', 'text/calendar')).toBe('text/calendar');
  });

  it('falls back to octet-stream when nothing is known', () => {
    expect(contentTypeFor(null, null)).toBe('application/octet-stream');
    expect(contentTypeFor('archive.xyz', 'application/octet-stream')).toBe('application/octet-stream');
  });
});

describe('dispositionFor', () => {
  it('shows images inline so they render in the ticket', () => {
    expect(dispositionFor('image/png', 'a.png')).toMatch(/^inline/);
    expect(dispositionFor('application/pdf', 'a.pdf')).toMatch(/^inline/);
  });

  it('forces SVG to download, since inline SVG can run script on our origin', () => {
    expect(dispositionFor('image/svg+xml', 'a.svg')).toMatch(/^attachment/);
  });

  it('downloads everything else and encodes the filename', () => {
    expect(dispositionFor('application/zip', 'bản ghi.zip')).toBe(
      "attachment; filename*=UTF-8''b%E1%BA%A3n%20ghi.zip",
    );
  });
});

describe('assertNotSignInPage for attachments', () => {
  it('does not flag a legitimate .html attachment', () => {
    const response = new Response('<html>report</html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });
    expect(() => assertNotSignInPage(response, { htmlIsSuspicious: false })).not.toThrow();
  });

  it('still flags a 203', () => {
    const response = new Response('<html/>', { status: 203 });
    expect(() => assertNotSignInPage(response, { htmlIsSuspicious: false })).toThrow();
  });
});

describe('fetchAttachment', () => {
  function clientReturning(response: Response) {
    return new AdoClient({
      config,
      fetchImpl: vi.fn(async () => response) as unknown as typeof fetch,
      sleep: async () => {},
    });
  }

  it('streams the body through with a corrected content type', async () => {
    const response = new Response(new Blob(['bytes']).stream(), {
      status: 200,
      headers: { 'content-type': 'application/octet-stream', 'content-length': '5' },
    });
    const result = await fetchAttachment(clientReturning(response), 'guid-1', 'shot.png');

    expect(result.contentType).toBe('image/png');
    expect(result.contentDisposition).toMatch(/^inline/);
    expect(result.contentLength).toBe('5');
    expect(result.body).toBeInstanceOf(ReadableStream);
  });

  it('reports a missing attachment as 404', async () => {
    const response = new Response('nope', { status: 404 });
    await expect(
      fetchAttachment(clientReturning(response), 'guid-1', 'a.png'),
    ).rejects.toMatchObject({ status: 404 });
  });
});
