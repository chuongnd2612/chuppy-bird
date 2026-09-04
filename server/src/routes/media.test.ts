import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.ts';
import { AdoClient } from '../ado/client.ts';
import { loadConfig } from '../config.ts';

const ENV = {
  ADO_BASE_URL: 'https://dev.azure.com/acme',
  ADO_PAT: 'pat',
  APP_PASSWORD: '',
  SESSION_SECRET: 's'.repeat(32),
};

async function appWithFetch(fetchImpl: typeof fetch) {
  const { config } = loadConfig(ENV);
  const client = new AdoClient({ config, fetchImpl, sleep: async () => {} });
  return buildApp({ config, logger: false, client });
}

function pngResponse() {
  return new Response(new Blob(['\x89PNG']).stream(), {
    status: 200,
    headers: { 'content-type': 'application/octet-stream' },
  });
}

describe('attachment proxy', () => {
  it('streams an attachment with the corrected type and no sniffing', async () => {
    const app = await appWithFetch(vi.fn(async () => pngResponse()) as unknown as typeof fetch);
    const response = await app.inject({
      method: 'GET',
      url: '/api/attachments/a1b2c3d4-1111-2222-3333-444455556666?fileName=shot.png',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/png');
    expect(response.headers['content-disposition']).toMatch(/^inline/);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['cache-control']).toMatch(/immutable/);
    await app.close();
  });

  it('sends the PAT upstream but never to the browser', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => pngResponse());
    const app = await appWithFetch(fetchImpl as unknown as typeof fetch);
    const response = await app.inject({
      method: 'GET',
      url: '/api/attachments/a1b2c3d4-1111-2222-3333-444455556666?fileName=a.png',
    });

    const headers = fetchImpl.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers['Authorization']).toContain('Basic');
    expect(JSON.stringify(response.headers)).not.toContain('Basic');
    await app.close();
  });

  it('rejects a malformed attachment id before calling ADO', async () => {
    const fetchImpl = vi.fn(async () => pngResponse());
    const app = await appWithFetch(fetchImpl as unknown as typeof fetch);
    const response = await app.inject({ method: 'GET', url: '/api/attachments/..%2Fsecret' });

    expect(response.statusCode).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('avatar proxy', () => {
  it('fetches an avatar on the configured host', async () => {
    const app = await appWithFetch(vi.fn(async () => pngResponse()) as unknown as typeof fetch);
    const response = await app.inject({
      method: 'GET',
      url: `/api/avatar?u=${encodeURIComponent('https://dev.azure.com/_apis/GraphProfile/MemberAvatars/abc')}`,
    });

    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it('refuses a foreign host, so it cannot be used as an open proxy', async () => {
    const fetchImpl = vi.fn(async () => pngResponse());
    const app = await appWithFetch(fetchImpl as unknown as typeof fetch);
    const response = await app.inject({
      method: 'GET',
      url: `/api/avatar?u=${encodeURIComponent('http://169.254.169.254/latest/meta-data/')}`,
    });

    expect(response.statusCode).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects a missing or malformed URL', async () => {
    const app = await appWithFetch(vi.fn(async () => pngResponse()) as unknown as typeof fetch);
    expect((await app.inject({ method: 'GET', url: '/api/avatar' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/avatar?u=nope' })).statusCode).toBe(400);
    await app.close();
  });
});

describe('demo mode', () => {
  it('does not register media routes, since there is no PAT to proxy with', async () => {
    const { config } = loadConfig({ DEMO_MODE: 'true', SESSION_SECRET: 's'.repeat(32) });
    const app = await buildApp({ config, logger: false });
    const response = await app.inject({ method: 'GET', url: '/api/attachments/abc' });

    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
