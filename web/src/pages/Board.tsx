import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AdoCard } from '../../../shared/types.ts';
import { api } from '../api/client.ts';
import { useAsync } from '../api/useAsync.ts';
import { Empty, ErrorNote, Loading } from '../components/States.tsx';
import { ThemeToggle } from '../components/ThemeToggle.tsx';
import { TicketCard } from '../components/TicketCard.tsx';

/** Cards ADO placed in a column the board does not define still have to go somewhere. */
const OTHER_COLUMN = 'Other';

function groupByColumn(cards: AdoCard[], columnNames: string[]): Map<string, AdoCard[]> {
  const groups = new Map<string, AdoCard[]>(columnNames.map((name) => [name, []]));
  const known = new Set(columnNames);

  for (const card of cards) {
    const key = card.column && known.has(card.column) ? card.column : OTHER_COLUMN;
    const group = groups.get(key);
    if (group) group.push(card);
    else groups.set(key, [card]);
  }
  // Drop the overflow bucket unless something actually landed in it.
  if (groups.get(OTHER_COLUMN)?.length === 0) groups.delete(OTHER_COLUMN);
  return groups;
}

export function Board() {
  const { project = '' } = useParams();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [includeClosed, setIncludeClosed] = useState(false);

  const teams = useAsync(() => api.teams(project), [project]);
  const activeTeam = teamId ?? teams.data?.[0]?.name ?? null;

  const boards = useAsync(
    () => (activeTeam ? api.boards(project, activeTeam) : Promise.resolve([])),
    [project, activeTeam],
  );
  const boardId = boards.data?.[0]?.id ?? null;

  const board = useAsync(
    () =>
      activeTeam && boardId
        ? api.board(project, activeTeam, boardId, includeClosed)
        : Promise.resolve(null),
    [project, activeTeam, boardId, includeClosed],
  );

  const columns = useMemo(() => {
    if (!board.data) return [];
    const names = board.data.columns.map((column) => column.name);
    return [...groupByColumn(board.data.cards, names).entries()];
  }, [board.data]);

  async function hardRefresh() {
    await api.refresh();
    board.reload();
  }

  const error = teams.error ?? boards.error ?? board.error;
  const loading = teams.loading || boards.loading || board.loading;

  return (
    <main className="page page--board">
      <header className="page__header">
        <Link to="/" className="back" aria-label="Back to projects">
          ←
        </Link>
        <h1>{project}</h1>
        <ThemeToggle />
        <button type="button" onClick={hardRefresh} aria-label="Refresh">
          ↻
        </button>
      </header>

      <div className="board__controls">
        {teams.data && teams.data.length > 1 ? (
          <select
            value={activeTeam ?? ''}
            onChange={(event) => setTeamId(event.target.value)}
            aria-label="Team"
          >
            {teams.data.map((team) => (
              <option key={team.id} value={team.name}>
                {team.name}
              </option>
            ))}
          </select>
        ) : null}
        <label className="toggle">
          <input
            type="checkbox"
            checked={includeClosed}
            onChange={(event) => setIncludeClosed(event.target.checked)}
          />
          Show done
        </label>
      </div>

      {error ? <ErrorNote error={error} onRetry={board.reload} /> : null}
      {loading && !board.data ? <Loading label="Loading board…" /> : null}
      {board.data && board.data.cards.length === 0 ? <Empty label="No work items on this board." /> : null}

      <div className="board">
        {columns.map(([name, cards]) => (
          <section className="column" key={name}>
            <h2 className="column__header">
              {name} <span className="muted">{cards.length}</span>
            </h2>
            <div className="column__cards">
              {cards.map((card) => (
                <TicketCard key={card.id} card={card} project={project} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
