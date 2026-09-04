import type { AdoComment } from '../../../shared/types.ts';
import { AdoHtml } from './AdoHtml.tsx';
import { Avatar } from './Avatar.tsx';

/** "3 days ago" reads better than a timestamp when scanning a thread. */
export function relativeTime(iso: string, now = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';

  const seconds = Math.round((now - then) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['day', 86_400],
    ['hour', 3600],
    ['minute', 60],
  ];
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return formatter.format(-Math.round(seconds / size), unit);
  }
  return formatter.format(-seconds, 'second');
}

interface CommentThreadProps {
  comments: AdoComment[];
  onImageTap: (src: string, alt: string) => void;
}

export function CommentThread({ comments, onImageTap }: CommentThreadProps) {
  if (comments.length === 0) {
    return <p className="muted">No comments.</p>;
  }

  return (
    <ol className="comments">
      {comments.map((comment) => (
        <li key={comment.id} className="comment">
          <Avatar identity={comment.createdBy} size={28} />
          <div className="comment__body">
            <div className="comment__meta">
              <strong>{comment.createdBy.displayName}</strong>
              <time dateTime={comment.createdDate} title={new Date(comment.createdDate).toLocaleString()}>
                {relativeTime(comment.createdDate)}
              </time>
              {comment.modifiedDate ? <span className="muted">edited</span> : null}
            </div>
            <AdoHtml html={comment.html} onImageTap={onImageTap} />
          </div>
        </li>
      ))}
    </ol>
  );
}
