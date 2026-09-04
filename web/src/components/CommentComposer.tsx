import { useCallback, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { AdoComment } from '../../../shared/types.ts';
import { api, ApiFailure } from '../api/client.ts';

interface CommentComposerProps {
  project: string;
  workItemId: number;
  onPosted: (comment: AdoComment) => void;
}

/** Matches the server's cap so the error arrives before a round trip. */
const MAX_LENGTH = 30_000;

export function CommentComposer({ project, workItemId, onPosted }: CommentComposerProps) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  const submit = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault();
      const body = text.trim();
      if (!body || busy) return;

      setBusy(true);
      setError(null);
      setHint(null);
      try {
        onPosted(await api.addComment(project, workItemId, body));
        setText('');
        // Reset the height the auto-grow handler stretched it to.
        if (field.current) field.current.style.height = '';
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not post the comment');
        if (cause instanceof ApiFailure) {
          setHint(
            cause.status === 401 || cause.status === 403
              ? 'Posting needs a PAT with the Work Items (Read & Write) scope.'
              : (cause.hint ?? null),
          );
        }
      } finally {
        setBusy(false);
      }
    },
    [busy, onPosted, project, text, workItemId],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter inserts a newline; a phone keyboard has no other way to get one.
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void submit();
  };

  const remaining = MAX_LENGTH - text.length;

  return (
    <form className="composer" onSubmit={submit}>
      <textarea
        ref={field}
        className="composer__input"
        value={text}
        rows={2}
        maxLength={MAX_LENGTH}
        placeholder="Add a comment…"
        aria-label="Add a comment"
        disabled={busy}
        onKeyDown={onKeyDown}
        onChange={(event) => {
          setText(event.target.value);
          // Grow with the text rather than making a phone scroll a 2-row box.
          const element = event.target;
          element.style.height = '';
          element.style.height = `${Math.min(element.scrollHeight, 240)}px`;
        }}
      />

      {error ? (
        <div className="state--error" role="alert">
          <p>{error}</p>
          {hint ? <p className="muted">{hint}</p> : null}
        </div>
      ) : null}

      <div className="composer__actions">
        {remaining < 500 ? <span className="muted">{remaining} left</span> : null}
        <button type="submit" disabled={busy || text.trim().length === 0}>
          {busy ? 'Posting…' : 'Comment'}
        </button>
      </div>
    </form>
  );
}
