import { Link } from 'react-router-dom';
import type { AdoCard } from '../../../shared/types.ts';
import { Avatar } from './Avatar.tsx';

const TYPE_COLORS: Record<string, string> = {
  bug: '#cc293d',
  'user story': '#0078d4',
  'product backlog item': '#0078d4',
  task: '#f2cb1d',
  feature: '#773b93',
  epic: '#ff7b00',
  issue: '#cc293d',
};

export function typeColor(workItemType: string): string {
  return TYPE_COLORS[workItemType.toLowerCase()] ?? '#8a8886';
}

export function TicketCard({ card, project }: { card: AdoCard; project: string }) {
  return (
    <Link className="card" to={`/p/${encodeURIComponent(project)}/wi/${card.id}`}>
      <span className="card__type" style={{ background: typeColor(card.workItemType) }} aria-hidden />
      <div className="card__body">
        <div className="card__meta">
          <span className="card__id">{card.id}</span>
          <span className="muted">{card.workItemType}</span>
          {card.priority !== null ? <span className="chip chip--priority">P{card.priority}</span> : null}
        </div>
        <p className="card__title">{card.title}</p>
        {card.tags.length > 0 ? (
          <div className="card__tags">
            {card.tags.map((tag) => (
              <span key={tag} className="chip">
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        <div className="card__footer">
          <Avatar identity={card.assignedTo} size={22} />
          <span className="muted">{card.state}</span>
        </div>
      </div>
    </Link>
  );
}
