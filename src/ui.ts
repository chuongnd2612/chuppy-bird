import { passes, reviewTicket } from './review.ts';
import type { Ticket } from './types.ts';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderTicket(ticket: Ticket): string {
  const review = reviewTicket(ticket);
  const status = passes(review) ? 'pass' : 'fail';
  const findings = review.findings
    .map(
      (finding) =>
        `<li class="finding finding--${finding.severity}">
           <code>${escapeHtml(finding.rule)}</code> ${escapeHtml(finding.message)}
         </li>`,
    )
    .join('');

  return `
    <article class="ticket ticket--${status}">
      <header>
        <span class="ticket__id">${escapeHtml(ticket.id)}</span>
        <h2>${escapeHtml(ticket.title)}</h2>
        <span class="badge badge--${status}">${status === 'pass' ? 'Ready' : 'Needs work'}</span>
      </header>
      <p>${escapeHtml(ticket.description)}</p>
      ${findings ? `<ul class="findings">${findings}</ul>` : '<p class="findings--empty">No findings.</p>'}
    </article>
  `;
}

export function renderApp(root: HTMLElement, tickets: Ticket[]): void {
  root.innerHTML = `
    <main>
      <h1>Ticket Reviewer</h1>
      <p class="lede">Checks tickets against the team's definition of ready.</p>
      ${tickets.map(renderTicket).join('')}
    </main>
  `;
}
