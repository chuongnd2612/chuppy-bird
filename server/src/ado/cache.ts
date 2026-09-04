/**
 * A tiny TTL cache. The board is the screen you reopen constantly on a phone,
 * and every reopen otherwise costs a WIQL query plus a batch fetch.
 */
export class TtlCache<T> {
  readonly #entries = new Map<string, { value: T; expiresAt: number }>();
  readonly #ttlMs: number;
  readonly #maxEntries: number;
  readonly #now: () => number;

  constructor(ttlSeconds: number, maxEntries = 200, now: () => number = Date.now) {
    this.#ttlMs = ttlSeconds * 1000;
    this.#maxEntries = maxEntries;
    this.#now = now;
  }

  get(key: string): T | undefined {
    if (this.#ttlMs <= 0) return undefined;
    const entry = this.#entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.#now()) {
      this.#entries.delete(key);
      return undefined;
    }
    // Refresh insertion order so the hot keys survive eviction.
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.#ttlMs <= 0) return;
    if (this.#entries.size >= this.#maxEntries) {
      const oldest = this.#entries.keys().next();
      if (!oldest.done) this.#entries.delete(oldest.value);
    }
    this.#entries.set(key, { value, expiresAt: this.#now() + this.#ttlMs });
  }

  /** Drop everything, or everything under a prefix (used by manual refresh). */
  clear(prefix?: string): void {
    if (prefix === undefined) {
      this.#entries.clear();
      return;
    }
    for (const key of this.#entries.keys()) {
      if (key.startsWith(prefix)) this.#entries.delete(key);
    }
  }

  get size(): number {
    return this.#entries.size;
  }
}
