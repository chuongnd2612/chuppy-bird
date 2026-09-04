import { describe, expect, it } from 'vitest';
import { ConcurrencyLimiter } from './limiter.ts';

describe('ConcurrencyLimiter', () => {
  it('admits up to the limit and refuses beyond it', () => {
    const limiter = new ConcurrencyLimiter(2);
    const first = limiter.tryAcquire();
    const second = limiter.tryAcquire();

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(limiter.tryAcquire()).toBeNull();
    expect(limiter.active).toBe(2);
  });

  it('frees a slot on release', () => {
    const limiter = new ConcurrencyLimiter(1);
    const release = limiter.tryAcquire();
    release?.();

    expect(limiter.active).toBe(0);
    expect(limiter.tryAcquire()).not.toBeNull();
  });

  it('ignores a double release, which would otherwise let extra runs through', () => {
    const limiter = new ConcurrencyLimiter(1);
    const release = limiter.tryAcquire();
    release?.();
    release?.();

    expect(limiter.active).toBe(0);
  });
});
