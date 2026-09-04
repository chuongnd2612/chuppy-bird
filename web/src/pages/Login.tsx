import { useState, type FormEvent } from 'react';
import { api, ApiFailure } from '../api/client.ts';

export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(password);
      onSignedIn();
    } catch (cause) {
      setError(cause instanceof ApiFailure ? cause.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page page--centred">
      <form className="login" onSubmit={submit}>
        <h1>Ticket Reviewer</h1>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          autoComplete="current-password"
          onChange={(event) => setPassword(event.target.value)}
          autoFocus
        />
        {error ? (
          <p className="state--error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={busy || password.length === 0}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
