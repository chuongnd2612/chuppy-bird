import type { AdoWorkItem } from '../../../shared/types.ts';
import { passes, reviewWorkItem } from '../../../shared/review.ts';

/**
 * The free offline check. It runs on data already on screen, so every ticket
 * gets a verdict without waiting on (or paying for) the Claude analysis.
 */
export function ReadinessPanel({ item }: { item: AdoWorkItem }) {
  const review = reviewWorkItem(item);
  if (review.findings.length === 0) {
    return <p className="readiness readiness--ok">Meets the definition of ready.</p>;
  }

  return (
    <div className={`readiness readiness--${passes(review) ? 'warn' : 'fail'}`}>
      <ul>
        {review.findings.map((finding) => (
          <li key={finding.rule} className={`finding finding--${finding.severity}`}>
            {finding.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
