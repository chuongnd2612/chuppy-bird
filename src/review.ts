import type { Finding, Review, Ticket } from './types.ts';

const MIN_TITLE_LENGTH = 10;
const MIN_DESCRIPTION_LENGTH = 40;

/** Rules a ticket has to satisfy before it is ready to be picked up. */
const rules: Array<(ticket: Ticket) => Finding | null> = [
  (ticket) =>
    ticket.title.trim().length >= MIN_TITLE_LENGTH
      ? null
      : {
          rule: 'title-too-short',
          severity: 'error',
          message: `Title is shorter than ${MIN_TITLE_LENGTH} characters — say what changes and where.`,
        },
  (ticket) =>
    ticket.description.trim().length >= MIN_DESCRIPTION_LENGTH
      ? null
      : {
          rule: 'description-too-short',
          severity: 'error',
          message: 'Description does not explain the problem or the expected behaviour.',
        },
  (ticket) =>
    ticket.acceptanceCriteria.length > 0
      ? null
      : {
          rule: 'missing-acceptance-criteria',
          severity: 'error',
          message: 'No acceptance criteria — there is no way to tell when this is done.',
        },
  (ticket) =>
    ticket.estimate !== null
      ? null
      : {
          rule: 'missing-estimate',
          severity: 'warning',
          message: 'No estimate set.',
        },
  (ticket) =>
    ticket.labels.length > 0
      ? null
      : {
          rule: 'missing-labels',
          severity: 'warning',
          message: 'No labels — the ticket will not show up in any filtered board.',
        },
];

export function reviewTicket(ticket: Ticket): Review {
  const findings = rules.map((rule) => rule(ticket)).filter((f): f is Finding => f !== null);
  return { ticketId: ticket.id, findings };
}

export function reviewTickets(tickets: Ticket[]): Review[] {
  return tickets.map(reviewTicket);
}

/** A ticket passes when nothing blocking was found; warnings alone do not fail it. */
export function passes(review: Review): boolean {
  return review.findings.every((finding) => finding.severity !== 'error');
}
