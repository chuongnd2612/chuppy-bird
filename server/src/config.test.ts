import { describe, expect, it } from 'vitest';
import { adoBaseUrl, loadConfig } from './config.ts';

const validEnv = {
  ADO_BASE_URL: 'https://dev.azure.com/acme',
  ADO_PAT: 'pat-value',
  APP_PASSWORD: 'hunter2',
  SESSION_SECRET: 'a'.repeat(32),
};

describe('loadConfig', () => {
  it('accepts a complete environment and applies defaults', () => {
    const { config, warnings } = loadConfig(validEnv);
    expect(config.PORT).toBe(8787);
    expect(config.ADO_API_VERSION).toBe('7.1');
    expect(config.DEMO_MODE).toBe(false);
    expect(warnings).toEqual([]);
  });

  it('requires ADO credentials unless demo mode is on', () => {
    expect(() => loadConfig({ APP_PASSWORD: 'x' })).toThrow(/ADO_BASE_URL/);
    expect(() => loadConfig({ DEMO_MODE: 'true', APP_PASSWORD: 'x', SESSION_SECRET: 's' })).not.toThrow();
  });

  it('warns loudly when no app password is set', () => {
    const { warnings } = loadConfig({ ...validEnv, APP_PASSWORD: '' });
    expect(warnings.join(' ')).toMatch(/UNAUTHENTICATED/);
  });

  it('warns when a password is set but the session secret is not', () => {
    const { warnings } = loadConfig({ ...validEnv, SESSION_SECRET: '' });
    expect(warnings.join(' ')).toMatch(/SESSION_SECRET/);
  });

  it('rejects a non-URL base', () => {
    expect(() => loadConfig({ ...validEnv, ADO_BASE_URL: 'tfs.internal' })).toThrow(/ADO_BASE_URL/);
  });
});

describe('adoBaseUrl', () => {
  it('trims trailing slashes', () => {
    const { config } = loadConfig({ ...validEnv, ADO_BASE_URL: 'https://dev.azure.com/acme/' });
    expect(adoBaseUrl(config)).toBe('https://dev.azure.com/acme');
  });
});
