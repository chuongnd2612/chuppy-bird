import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  /** Re-runs the loader; used by the refresh control. */
  reload: () => void;
}

/**
 * Loads data on mount and whenever `deps` change.
 *
 * The generation counter is what stops a slow first request from overwriting a
 * fast second one — easy to hit on a phone switching between boards.
 */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    setLoading(true);
    setError(null);

    load()
      .then((result) => {
        if (generation.current === current) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((cause: unknown) => {
        if (generation.current === current) {
          setError(cause instanceof Error ? cause : new Error(String(cause)));
          setLoading(false);
        }
      });
    // `load` is intentionally excluded: callers pass an inline closure, and the
    // explicit dep list is what decides when a reload is warranted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  return { data, error, loading, reload };
}
