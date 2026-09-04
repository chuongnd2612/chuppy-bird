/**
 * Caps how many analyses run at once. This is somebody's laptop, and each run
 * is a model turn with tool access — two at a time is already a lot.
 */
export class ConcurrencyLimiter {
  #active = 0;
  readonly #max: number;

  constructor(max: number) {
    this.#max = max;
  }

  /** Returns a release function, or null when already at capacity. */
  tryAcquire(): (() => void) | null {
    if (this.#active >= this.#max) return null;
    this.#active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#active--;
    };
  }

  get active(): number {
    return this.#active;
  }
}
