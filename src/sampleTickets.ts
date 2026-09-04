import type { Ticket } from './types.ts';

/** Placeholder data so the app renders before a tracker is wired up. */
export const sampleTickets: Ticket[] = [
  {
    id: 'TR-1',
    title: 'Add pagination to the ticket list endpoint',
    description:
      'The list endpoint returns every ticket in one response, which times out past ~5k rows. Add cursor-based pagination with a default page size of 50.',
    acceptanceCriteria: [
      'GET /tickets accepts `cursor` and `limit` query parameters',
      'Response carries `nextCursor` when more rows exist',
      'Default limit is 50, maximum is 200',
    ],
    labels: ['api', 'performance'],
    estimate: 3,
  },
  {
    id: 'TR-2',
    title: 'Fix bug',
    description: 'It breaks sometimes.',
    acceptanceCriteria: [],
    labels: [],
    estimate: null,
  },
];
