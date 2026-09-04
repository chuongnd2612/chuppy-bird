import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AdoAttachment } from '../../../shared/types.ts';
import { api } from '../api/client.ts';
import { useAsync } from '../api/useAsync.ts';
import { AdoHtml } from '../components/AdoHtml.tsx';
import { Avatar } from '../components/Avatar.tsx';
import { CommentThread, relativeTime } from '../components/CommentThread.tsx';
import { Lightbox } from '../components/Lightbox.tsx';
import { ReadinessPanel } from '../components/Readiness.tsx';
import { ErrorNote, Loading } from '../components/States.tsx';
import { typeColor } from '../components/TicketCard.tsx';

function formatSize(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function Section({ title, html, onImageTap }: { title: string; html: string | null; onImageTap: (src: string, alt: string) => void }) {
  if (!html) return null;
  return (
    <section className="section">
      <h2>{title}</h2>
      <AdoHtml html={html} onImageTap={onImageTap} />
    </section>
  );
}

function Attachments({ attachments, onImageTap }: { attachments: AdoAttachment[]; onImageTap: (src: string, alt: string) => void }) {
  if (attachments.length === 0) return null;
  const images = attachments.filter((attachment) => attachment.isImage);
  const files = attachments.filter((attachment) => !attachment.isImage);

  return (
    <section className="section">
      <h2>Attachments</h2>
      {images.length > 0 ? (
        <div className="thumbs">
          {images.map((image) => (
            <button
              type="button"
              key={image.id}
              className="thumb"
              onClick={() => onImageTap(image.url, image.name)}
            >
              <img src={image.url} alt={image.name} loading="lazy" />
            </button>
          ))}
        </div>
      ) : null}
      {files.length > 0 ? (
        <ul className="list">
          {files.map((file) => (
            <li key={file.id}>
              <a className="list__row" href={file.url} target="_blank" rel="noopener noreferrer">
                <span>{file.name}</span>
                <span className="muted">{formatSize(file.sizeBytes)}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function TicketDetail() {
  const { project = '', id = '' } = useParams();
  const workItemId = Number(id);
  const [zoomed, setZoomed] = useState<{ src: string; alt: string } | null>(null);
  const onImageTap = (src: string, alt: string) => setZoomed({ src, alt });

  const item = useAsync(() => api.workItem(project, workItemId), [project, workItemId]);
  const comments = useAsync(() => api.comments(project, workItemId), [project, workItemId]);

  return (
    <main className="page">
      <header className="page__header">
        <Link to={`/p/${encodeURIComponent(project)}`} className="back" aria-label="Back to board">
          ←
        </Link>
        <h1 className="muted">#{id}</h1>
        <button type="button" onClick={item.reload} aria-label="Refresh">
          ↻
        </button>
      </header>

      {item.loading ? <Loading label="Loading work item…" /> : null}
      {item.error ? <ErrorNote error={item.error} onRetry={item.reload} /> : null}

      {item.data ? (
        <article className="detail">
          <div className="detail__title">
            <span className="card__type" style={{ background: typeColor(item.data.workItemType) }} aria-hidden />
            <h2>{item.data.title}</h2>
          </div>

          <dl className="fields">
            <div>
              <dt>State</dt>
              <dd>{item.data.state}</dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>{item.data.workItemType}</dd>
            </div>
            <div>
              <dt>Assigned</dt>
              <dd className="field--identity">
                <Avatar identity={item.data.assignedTo} size={22} />
                {item.data.assignedTo?.displayName ?? 'Unassigned'}
              </dd>
            </div>
            {item.data.iterationPath ? (
              <div>
                <dt>Iteration</dt>
                <dd>{item.data.iterationPath}</dd>
              </div>
            ) : null}
            {item.data.storyPoints !== null ? (
              <div>
                <dt>Points</dt>
                <dd>{item.data.storyPoints}</dd>
              </div>
            ) : null}
            <div>
              <dt>Updated</dt>
              <dd>{relativeTime(item.data.changedDate)}</dd>
            </div>
          </dl>

          {item.data.tags.length > 0 ? (
            <div className="card__tags">
              {item.data.tags.map((tag) => (
                <span key={tag} className="chip">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}

          <ReadinessPanel item={item.data} />

          <Section title="Description" html={item.data.descriptionHtml} onImageTap={onImageTap} />
          <Section title="Repro steps" html={item.data.reproStepsHtml} onImageTap={onImageTap} />
          <Section title="Acceptance criteria" html={item.data.acceptanceCriteriaHtml} onImageTap={onImageTap} />

          <Attachments attachments={item.data.attachments} onImageTap={onImageTap} />

          {item.data.relations.length > 0 ? (
            <section className="section">
              <h2>Links</h2>
              <ul className="list">
                {item.data.relations.map((relation) => (
                  <li key={`${relation.name}-${relation.workItemId}`}>
                    <Link
                      className="list__row"
                      to={`/p/${encodeURIComponent(project)}/wi/${relation.workItemId}`}
                    >
                      <span>{relation.name}</span>
                      <span className="muted">#{relation.workItemId}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="section">
            <h2>Comments</h2>
            {comments.loading ? <Loading /> : null}
            {comments.error ? <ErrorNote error={comments.error} onRetry={comments.reload} /> : null}
            {comments.data ? <CommentThread comments={comments.data} onImageTap={onImageTap} /> : null}
          </section>

          {item.data.webUrl ? (
            <a className="external" href={item.data.webUrl} target="_blank" rel="noopener noreferrer">
              Open in Azure DevOps
            </a>
          ) : null}
        </article>
      ) : null}

      {zoomed ? <Lightbox src={zoomed.src} alt={zoomed.alt} onClose={() => setZoomed(null)} /> : null}
    </main>
  );
}
