import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../config.ts';
import { AdoClient, assertNotSignInPage } from './client.ts';
import { AdoAuthError, AdoError } from './errors.ts';

const { config } = loadConfig({
  ADO_BASE_URL: 'https://dev.azure.com/acme',
  ADO_PAT: 'secret-pat',
  APP_PASSWORD: 'pw',
  SESSION_SECRET: 's'.repeat(32),
});

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function makeClient(fetchImpl: typeof fetch, maxRetries = 3) {
  return new AdoClient({ config, fetchImpl, sleep: async () => {}, maxRetries });
}

describe('buildUrl', () => {
  const client = makeClient(vi.fn());

  it('joins the collection root and appends the api version', () => {
    expect(client.buildUrl({ path: '_apis/projects' })).toBe(
      'https://dev.azure.com/acme/_apis/projects?api-version=7.1',
    );
  });

  it('tolerates a leading slash on the path', () => {
    expect(client.buildUrl({ path: '/_apis/projects' })).toContain('/acme/_apis/projects');
  });

  it('lets an endpoint override the api version for preview APIs', () => {
    expect(client.buildUrl({ path: 'x', apiVersion: '7.1-preview.4' })).toContain(
      'api-version=7.1-preview.4',
    );
  });

  it('skips undefined query values and encodes the rest', () => {
    const url = client.buildUrl({ path: 'x', query: { ids: '1,2', top: undefined, q: 'a b' } });
    expect(url).toContain('ids=1%2C2');
    expect(url).toContain('q=a+b');
    expect(url).not.toContain('top=');
  });
});

describe('authentication header', () => {
  it('sends the PAT as an empty-username basic credential', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse({ ok: true }),
    );
    await makeClient(fetchImpl as unknown as typeof fetch).requestJson({ path: '_apis/projects' });

    const init = fetchImpl.mock.calls[0]?.[1];
    const header = (init?.headers as Record<string, string>)['Authorization'];
    expect(header).toBe(`Basic ${Buffer.from(':secret-pat').toString('base64')}`);
  });
});

describe('sign-in page detection', () => {
  it('treats a 203 as an auth failure, not a success', () => {
    const response = new Response('<html>sign in</html>', {
      status: 203,
      headers: { 'content-type': 'text/html' },
    });
    expect(() => assertNotSignInPage(response)).toThrow(AdoAuthError);
  });

  it('treats an HTML 200 as an auth failure', () => {
    const response = new Response('<html/>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
    expect(() => assertNotSignInPage(response)).toThrow(/sign-in page/);
  });

  it('treats a redirect to interactive sign-in as an auth failure', () => {
    expect(() => assertNotSignInPage(new Response(null, { status: 302 }))).toThrow(AdoAuthError);
  });

  it('lets a normal JSON response through', () => {
    expect(() => assertNotSignInPage(jsonResponse({}))).not.toThrow();
  });

  it('surfaces the PAT hint so the user knows what to fix', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html/>', {
      status: 203,
      headers: { 'content-type': 'text/html' },
    }));
    await expect(
      makeClient(fetchImpl as unknown as typeof fetch).requestJson({ path: 'x' }),
    ).rejects.toMatchObject({ status: 401, hint: expect.stringContaining('Work Items (Read)') });
  });
});

describe('error mapping', () => {
  it('maps 403 to an auth error carrying the ADO message', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ message: 'TF400813: no access' }, { status: 403 }),
    );
    await expect(
      makeClient(fetchImpl as unknown as typeof fetch).requestJson({ path: 'x' }),
    ).rejects.toThrow(/TF400813/);
  });

  it('maps 404 with a hint', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ message: 'gone' }, { status: 404 }));
    await expect(
      makeClient(fetchImpl as unknown as typeof fetch).requestJson({ path: 'x' }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('survives a non-JSON error body from on-prem', async () => {
    const fetchImpl = vi.fn(async () => new Response('plain failure', { status: 400 }));
    await expect(
      makeClient(fetchImpl as unknown as typeof fetch).requestJson({ path: 'x' }),
    ).rejects.toThrow(AdoError);
  });
});

describe('retries', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retries a 503 and returns the eventual success', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ value: 'ok' }));

    const result = await makeClient(fetchImpl as unknown as typeof fetch).requestJson<{ value: string }>({
      path: 'x',
    });
    expect(result.value).toBe('ok');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('retries a network error then gives up with a VPN hint', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(
      makeClient(fetchImpl as unknown as typeof fetch, 2).requestJson({ path: 'x' }),
    ).rejects.toMatchObject({ status: 504, hint: expect.stringContaining('VPN') });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('does not retry a 404', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, { status: 404 }));
    await expect(
      makeClient(fetchImpl as unknown as typeof fetch).requestJson({ path: 'x' }),
    ).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not retry when the caller aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn().mockRejectedValue(new Error('aborted'));
    await expect(
      makeClient(fetchImpl as unknown as typeof fetch).requestJson({
        path: 'x',
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
