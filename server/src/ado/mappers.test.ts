import { describe, expect, it } from 'vitest';
import { FIELD } from './fields.ts';
import {
  parseTags,
  proxyAvatarUrl,
  relationName,
  toAttachments,
  toCard,
  toIdentity,
  toWorkItem,
  workItemIdFromUrl,
  type RawWorkItem,
} from './mappers.ts';

const ORIGIN = 'https://dev.azure.com';
const GUID = 'a1b2c3d4-1111-2222-3333-444455556666';

describe('proxyAvatarUrl', () => {
  it('proxies an avatar hosted on the configured collection', () => {
    expect(proxyAvatarUrl('https://dev.azure.com/_apis/GraphProfile/x', ORIGIN)).toBe(
      '/api/avatar?u=https%3A%2F%2Fdev.azure.com%2F_apis%2FGraphProfile%2Fx',
    );
  });

  it('refuses a foreign origin, so this cannot become an open relay', () => {
    expect(proxyAvatarUrl('https://evil.example/pic.png', ORIGIN)).toBeNull();
  });

  it('handles a missing or unparseable URL', () => {
    expect(proxyAvatarUrl(undefined, ORIGIN)).toBeNull();
    expect(proxyAvatarUrl('not a url', ORIGIN)).toBeNull();
  });
});

describe('toIdentity', () => {
  it('maps a full identity', () => {
    const identity = toIdentity(
      { id: 'u1', displayName: 'Mai Tran', imageUrl: 'https://dev.azure.com/a' },
      ORIGIN,
    );
    expect(identity).toEqual({ id: 'u1', displayName: 'Mai Tran', avatarUrl: '/api/avatar?u=https%3A%2F%2Fdev.azure.com%2Fa' });
  });

  it('falls back to the unique name when there is no display name', () => {
    expect(toIdentity({ uniqueName: 'mai@acme.com' }, ORIGIN)?.displayName).toBe('mai@acme.com');
  });

  it('returns null for an unassigned field', () => {
    expect(toIdentity(undefined, ORIGIN)).toBeNull();
    expect(toIdentity({}, ORIGIN)).toBeNull();
  });
});

describe('parseTags', () => {
  it('splits ADO semicolon-separated tags and trims them', () => {
    expect(parseTags('checkout; p1 ;  ')).toEqual(['checkout', 'p1']);
  });

  it('returns an empty list for missing tags', () => {
    expect(parseTags(undefined)).toEqual([]);
    expect(parseTags('')).toEqual([]);
  });
});

describe('relationName and workItemIdFromUrl', () => {
  it('translates hierarchy links into words', () => {
    expect(relationName('System.LinkTypes.Hierarchy-Reverse')).toBe('Parent');
    expect(relationName('System.LinkTypes.Hierarchy-Forward')).toBe('Child');
  });

  it('ignores attachment and hyperlink relations', () => {
    expect(relationName('AttachedFile')).toBeNull();
    expect(relationName(undefined)).toBeNull();
  });

  it('extracts the work item id from a relation URL', () => {
    expect(workItemIdFromUrl('https://dev.azure.com/acme/_apis/wit/workItems/900')).toBe(900);
    expect(workItemIdFromUrl('https://dev.azure.com/acme/_apis/wit/attachments/x')).toBeNull();
  });
});

describe('toAttachments', () => {
  it('maps attached files onto the proxy and flags images', () => {
    const attachments = toAttachments([
      {
        rel: 'AttachedFile',
        url: `https://dev.azure.com/acme/_apis/wit/attachments/${GUID}`,
        attributes: { name: 'shot.png', resourceSize: 2048 },
      },
      { rel: 'System.LinkTypes.Related', url: 'https://dev.azure.com/acme/_apis/wit/workItems/5' },
    ]);

    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({ id: GUID, name: 'shot.png', sizeBytes: 2048, isImage: true });
    expect(attachments[0]?.url).toBe(`/api/attachments/${GUID}?fileName=shot.png`);
  });

  it('handles a missing size and a non-image', () => {
    const [attachment] = toAttachments([
      { rel: 'AttachedFile', url: `_apis/wit/attachments/${GUID}`, attributes: { name: 'spec.docx' } },
    ]);
    expect(attachment).toMatchObject({ sizeBytes: null, isImage: false });
  });
});

describe('toCard', () => {
  it('maps the board fields', () => {
    const card = toCard(
      {
        id: 7,
        fields: {
          [FIELD.title]: 'Timeouts at checkout',
          [FIELD.workItemType]: 'Bug',
          [FIELD.state]: 'Active',
          [FIELD.boardColumn]: 'Doing',
          [FIELD.tags]: 'checkout; p1',
          [FIELD.priority]: 1,
          [FIELD.changedDate]: '2026-09-01T09:30:00Z',
        },
      },
      ORIGIN,
    );
    expect(card).toMatchObject({ id: 7, column: 'Doing', tags: ['checkout', 'p1'], priority: 1 });
  });

  it('survives a work item with no fields at all', () => {
    const card = toCard({ id: 9 }, ORIGIN);
    expect(card.title).toBe('Work item 9');
    expect(card.state).toBe('Unknown');
    expect(card.column).toBeNull();
  });
});

describe('toWorkItem', () => {
  const raw: RawWorkItem = {
    id: 1042,
    fields: {
      [FIELD.title]: 'Card payments time out',
      [FIELD.workItemType]: 'Bug',
      [FIELD.state]: 'Active',
      [FIELD.description]: `<div>Broken<img src="_apis/wit/attachments/${GUID}?fileName=a.png"></div>`,
      [FIELD.acceptanceCriteria]: '<p>&nbsp;</p>',
      [FIELD.effort]: 5,
      [FIELD.createdDate]: '2026-08-20T02:11:00Z',
      [FIELD.changedDate]: '2026-09-01T09:30:00Z',
    },
    relations: [
      { rel: 'AttachedFile', url: `_apis/wit/attachments/${GUID}`, attributes: { name: 'a.png' } },
      { rel: 'System.LinkTypes.Hierarchy-Reverse', url: 'https://dev.azure.com/a/_apis/wit/workItems/900' },
    ],
    _links: { html: { href: 'https://dev.azure.com/acme/P/_workitems/edit/1042' } },
  };

  it('rewrites embedded images in the description', () => {
    expect(toWorkItem(raw, ORIGIN).descriptionHtml).toContain(`/api/attachments/${GUID}`);
  });

  it('drops a field that holds only markup', () => {
    expect(toWorkItem(raw, ORIGIN).acceptanceCriteriaHtml).toBeNull();
  });

  it('reads Effort when the Scrum template has no Story Points', () => {
    expect(toWorkItem(raw, ORIGIN).storyPoints).toBe(5);
  });

  it('splits attachments from relations', () => {
    const item = toWorkItem(raw, ORIGIN);
    expect(item.attachments).toHaveLength(1);
    expect(item.relations).toEqual([{ name: 'Parent', workItemId: 900 }]);
  });

  it('keeps the ADO web link for when the VPN is available', () => {
    expect(toWorkItem(raw, ORIGIN).webUrl).toContain('_workitems/edit/1042');
  });
});
