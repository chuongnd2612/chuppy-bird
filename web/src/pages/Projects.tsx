import { Link } from 'react-router-dom';
import { api } from '../api/client.ts';
import { useAsync } from '../api/useAsync.ts';
import { Empty, ErrorNote, Loading } from '../components/States.tsx';
import { ThemeToggle } from '../components/ThemeToggle.tsx';

export function Projects() {
  const { data, error, loading, reload } = useAsync(() => api.projects(), []);

  return (
    <main className="page">
      <header className="page__header">
        <h1>Projects</h1>
        <ThemeToggle />
        <button type="button" onClick={reload} aria-label="Refresh">
          ↻
        </button>
      </header>

      {loading ? <Loading /> : null}
      {error ? <ErrorNote error={error} onRetry={reload} /> : null}
      {data?.length === 0 ? <Empty label="No projects are visible to this PAT." /> : null}

      <ul className="list">
        {data?.map((project) => (
          <li key={project.id}>
            <Link className="list__row" to={`/p/${encodeURIComponent(project.name)}`}>
              <span>{project.name}</span>
              {project.description ? <span className="muted">{project.description}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
