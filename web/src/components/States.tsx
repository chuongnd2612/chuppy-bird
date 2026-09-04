import { ApiFailure } from '../api/client.ts';

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <p className="state muted" role="status">
      {label}
    </p>
  );
}

/**
 * Error display. The server's hint is the part that usually says what to do
 * (an expired PAT, a missing scope), so it is shown, not swallowed.
 */
export function ErrorNote({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  const hint = error instanceof ApiFailure ? error.hint : undefined;
  return (
    <div className="state state--error" role="alert">
      <p>{error.message}</p>
      {hint ? <p className="muted">{hint}</p> : null}
      {onRetry ? (
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function Empty({ label }: { label: string }) {
  return <p className="state muted">{label}</p>;
}
