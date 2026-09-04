import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { api, ApiFailure } from './api/client.ts';
import { ErrorNote, Loading } from './components/States.tsx';
import { Board } from './pages/Board.tsx';
import { Login } from './pages/Login.tsx';
import { Projects } from './pages/Projects.tsx';
import { TicketDetail } from './pages/TicketDetail.tsx';

type AuthState = 'checking' | 'signed-in' | 'signed-out' | 'unreachable';

export function App() {
  const [auth, setAuth] = useState<AuthState>('checking');
  const [error, setError] = useState<Error | null>(null);

  /**
   * There is no "am I signed in" endpoint by design — the cheapest honest test
   * is whether a real read succeeds. A 401 means the cookie is missing or
   * expired; anything else is a server problem worth showing as itself.
   */
  const check = useCallback(async () => {
    setAuth('checking');
    setError(null);
    try {
      const { authRequired } = await api.authStatus();
      if (!authRequired) {
        setAuth('signed-in');
        return;
      }
      await api.projects();
      setAuth('signed-in');
    } catch (cause) {
      if (cause instanceof ApiFailure && cause.status === 401) {
        setAuth('signed-out');
        return;
      }
      setError(cause instanceof Error ? cause : new Error(String(cause)));
      setAuth('unreachable');
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  if (auth === 'checking') return <Loading label="Connecting…" />;
  if (auth === 'unreachable' && error) {
    return (
      <main className="page page--centred">
        <ErrorNote error={error} onRetry={() => void check()} />
      </main>
    );
  }
  if (auth === 'signed-out') return <Login onSignedIn={() => void check()} />;

  return (
    <Routes>
      <Route path="/" element={<Projects />} />
      <Route path="/p/:project" element={<Board />} />
      <Route path="/p/:project/wi/:id" element={<TicketDetail />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
