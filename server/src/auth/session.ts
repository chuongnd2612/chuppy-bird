import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * A single-user session. The whole app is one person's window onto their own
 * board, so there is no user table — just proof that whoever holds this cookie
 * knew APP_PASSWORD.
 */

export const SESSION_COOKIE = 'ado_session';

/** Compares without leaking how much of the password matched. */
export function passwordMatches(supplied: string, expected: string): boolean {
  // Hash first so the comparison is over equal-length buffers regardless of
  // what was typed; timingSafeEqual throws on a length mismatch.
  const secret = 'password-compare';
  const a = createHmac('sha256', secret).update(supplied).digest();
  const b = createHmac('sha256', secret).update(expected).digest();
  return timingSafeEqual(a, b);
}

export function generateSecret(): string {
  return randomBytes(32).toString('base64url');
}

export interface SessionPayload {
  /** Unix milliseconds. */
  expiresAt: number;
}

export function encodeSession(expiresAt: number): string {
  return String(expiresAt);
}

export function decodeSession(raw: string | undefined, now = Date.now()): SessionPayload | null {
  if (!raw) return null;
  const expiresAt = Number(raw);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;
  return { expiresAt };
}
