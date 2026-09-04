import { describe, expect, it } from 'vitest';
import { TtlCache } from './cache.ts';

describe('TtlCache', () => {
  it('returns a value before it expires and drops it after', () => {
    let now = 1000;
    const cache = new TtlCache<string>(60, 10, () => now);
    cache.set('a', 'value');
    expect(cache.get('a')).toBe('value');

    now += 59_000;
    expect(cache.get('a')).toBe('value');

    now += 2_000;
    expect(cache.get('a')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('is a no-op when the TTL is zero, so caching can be turned off', () => {
    const cache = new TtlCache<string>(0);
    cache.set('a', 'value');
    expect(cache.get('a')).toBeUndefined();
  });

  it('evicts the least recently used entry at capacity', () => {
    const cache = new TtlCache<number>(60, 2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // 'a' is now the hot key, so 'b' should go first
    cache.set('c', 3);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
  });

  it('clears everything, or just one prefix', () => {
    const cache = new TtlCache<number>(60);
    cache.set('board:1', 1);
    cache.set('board:2', 2);
    cache.set('projects', 3);

    cache.clear('board:');
    expect(cache.get('board:1')).toBeUndefined();
    expect(cache.get('projects')).toBe(3);

    cache.clear();
    expect(cache.size).toBe(0);
  });
});
