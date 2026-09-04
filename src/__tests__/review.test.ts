import { describe, expect, it } from 'vitest';
import { passes, reviewTicket, reviewTickets } from '../review.ts';
import { sampleTickets } from '../sampleTickets.ts';
import type { Ticket } from '../types.ts';

const goodTicket: Ticket = {
  id: 'TR-100',
  title: 'Add pagination to the ticket list endpoint',
  description:
    'The list endpoint returns every ticket at once and times out on large projects. Paginate it.',
  acceptanceCriteria: ['Endpoint accepts a cursor', 'Default page size is 50'],
  labels: ['api'],
  estimate: 3,
};

describe('reviewTicket', () => {
  it('reports no findings for a complete ticket', () => {
    expect(reviewTicket(goodTicket).findings).toEqual([]);
  });

  it('flags a short title as an error', () => {
    const review = reviewTicket({ ...goodTicket, title: 'Fix it' });
    expect(review.findings.map((f) => f.rule)).toContain('title-too-short');
    expect(passes(review)).toBe(false);
  });

  it('flags a missing estimate as a warning only', () => {
    const review = reviewTicket({ ...goodTicket, estimate: null });
    expect(review.findings).toHaveLength(1);
    expect(review.findings[0]?.severity).toBe('warning');
    expect(passes(review)).toBe(true);
  });

  it('flags every blocking gap on an empty ticket', () => {
    const review = reviewTicket({
      id: 'TR-101',
      title: '',
      description: '',
      acceptanceCriteria: [],
      labels: [],
      estimate: null,
    });
    expect(review.findings.map((f) => f.rule)).toEqual([
      'title-too-short',
      'description-too-short',
      'missing-acceptance-criteria',
      'missing-estimate',
      'missing-labels',
    ]);
  });
});

describe('reviewTickets', () => {
  it('reviews the sample tickets and keeps their order', () => {
    const reviews = reviewTickets(sampleTickets);
    expect(reviews.map((r) => r.ticketId)).toEqual(['TR-1', 'TR-2']);
    expect(reviews.map(passes)).toEqual([true, false]);
  });
});
