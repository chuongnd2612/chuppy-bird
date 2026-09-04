import type { AdoBoard, AdoProject, AdoWorkItem } from './types.ts';

/**
 * Fixtures shaped like real ADO payloads, used by the tests and by DEMO_MODE so
 * the UI can be exercised without a PAT or a VPN.
 */

export const demoProjects: AdoProject[] = [
  { id: 'p1', name: 'Payments', description: 'Billing and payment rails' },
  { id: 'p2', name: 'Platform', description: null },
];

export function makeWorkItem(overrides: Partial<AdoWorkItem> = {}): AdoWorkItem {
  return {
    id: 1042,
    title: 'Card payments time out under load',
    workItemType: 'Bug',
    state: 'Active',
    reason: 'New',
    areaPath: 'Payments\\Checkout',
    iterationPath: 'Payments\\Sprint 14',
    assignedTo: { id: 'u1', displayName: 'Mai Tran', avatarUrl: '/api/avatars/u1' },
    createdBy: { id: 'u2', displayName: 'Hao Nguyen', avatarUrl: '/api/avatars/u2' },
    createdDate: '2026-08-20T02:11:00Z',
    changedDate: '2026-09-01T09:30:00Z',
    tags: ['checkout', 'p1'],
    priority: 1,
    storyPoints: null,
    descriptionHtml:
      '<div>Checkout returns 504 for roughly 3% of card payments once traffic passes ~800 rps.</div>',
    reproStepsHtml:
      '<ol><li>Run the load profile at 800 rps</li><li>Watch the gateway logs</li></ol>',
    acceptanceCriteriaHtml: null,
    attachments: [
      {
        id: 'a1b2c3d4-0000-0000-0000-000000000001',
        name: 'latency.png',
        url: '/api/attachments/a1b2c3d4-0000-0000-0000-000000000001?fileName=latency.png',
        sizeBytes: 51200,
        isImage: true,
      },
    ],
    relations: [{ name: 'Parent', workItemId: 900 }],
    webUrl: 'https://dev.azure.com/acme/Payments/_workitems/edit/1042',
    ...overrides,
  };
}

export const demoBoard: AdoBoard = {
  id: 'b1',
  name: 'Payments Team',
  columns: [
    { id: 'c1', name: 'New', order: 0, itemLimit: 0 },
    { id: 'c2', name: 'Active', order: 1, itemLimit: 5 },
    { id: 'c3', name: 'Resolved', order: 2, itemLimit: 5 },
    { id: 'c4', name: 'Closed', order: 3, itemLimit: 0 },
  ],
  cards: [
    {
      id: 1042,
      title: 'Card payments time out under load',
      workItemType: 'Bug',
      state: 'Active',
      column: 'Active',
      assignedTo: { id: 'u1', displayName: 'Mai Tran', avatarUrl: '/api/avatars/u1' },
      tags: ['checkout', 'p1'],
      priority: 1,
      changedDate: '2026-09-01T09:30:00Z',
    },
    {
      id: 1043,
      title: 'Fix it',
      workItemType: 'User Story',
      state: 'New',
      column: 'New',
      assignedTo: null,
      tags: [],
      priority: null,
      changedDate: '2026-08-30T11:00:00Z',
    },
  ],
};
