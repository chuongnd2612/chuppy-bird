import { describe, expect, it } from 'vitest';
import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';

async function testApp(env: Record<string, string> = {}) {
  const { config } = loadConfig({
    DEMO_MODE: 'true',
    APP_PASSWORD: 'pw',
    SESSION_SECRET: 's'.repeat(32),
    ...env,
  });
  return buildApp({ config, logger: false });
}

describe('buildApp', () => {
  it('answers the health check', async () => {
    const app = await testApp();
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, demoMode: true });
    await app.close();
  });

  it('404s unknown API paths as JSON rather than serving the SPA', async () => {
    const app = await testApp({ APP_PASSWORD: '' });
    const response = await app.inject({ method: 'GET', url: '/api/nope' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Not found' });
    await app.close();
  });

  it('does not reveal whether an API path exists to an unauthenticated caller', async () => {
    const app = await testApp();
    const response = await app.inject({ method: 'GET', url: '/api/nope' });

    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
