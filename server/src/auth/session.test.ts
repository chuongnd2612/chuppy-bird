import { describe, expect, it } from 'vitest';
import { decodeSession, encodeSession, generateSecret, passwordMatches } from './session.ts';

describe('passwordMatches', () => {
  it('accepts the right password and rejects the rest', () => {
    expect(passwordMatches('hunter2', 'hunter2')).toBe(true);
    expect(passwordMatches('hunter3', 'hunter2')).toBe(false);
  });

  it('handles differing lengths without throwing', () => {
    expect(passwordMatches('', 'hunter2')).toBe(false);
    expect(passwordMatches('a-very-long-guess', 'x')).toBe(false);
  });
});

describe('session encoding', () => {
  it('round-trips an unexpired session', () => {
    const expiresAt = Date.now() + 60_000;
    expect(decodeSession(encodeSession(expiresAt))).toEqual({ expiresAt });
  });

  it('rejects an expired, missing or malformed session', () => {
    expect(decodeSession(encodeSession(Date.now() - 1))).toBeNull();
    expect(decodeSession(undefined)).toBeNull();
    expect(decodeSession('not-a-number')).toBeNull();
  });
});

describe('generateSecret', () => {
  it('produces a distinct URL-safe secret each call', () => {
    const a = generateSecret();
    expect(a).toMatch(/^[\w-]+$/);
    expect(a).not.toBe(generateSecret());
  });
});
