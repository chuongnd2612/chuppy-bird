import type {
  AdoAttachment,
  AdoCard,
  AdoIdentity,
  AdoRelation,
  AdoWorkItem,
} from '../../../shared/types.ts';
import { FIELD } from './fields.ts';
import { looksLikeImage, parseAttachmentUrl, proxyAttachmentUrl, renderAdoHtml } from './html.ts';

/** Raw shapes, narrowed just enough to read safely without trusting ADO's docs. */
export interface RawIdentity {
  id?: string;
  displayName?: string;
  imageUrl?: string;
  uniqueName?: string;
}

export interface RawRelation {
  rel?: string;
  url?: string;
  attributes?: { name?: string; resourceSize?: number; comment?: string };
}

export interface RawWorkItem {
  id: number;
  fields?: Record<string, unknown>;
  relations?: RawRelation[];
  _links?: { html?: { href?: string } };
}

/**
 * Avatars sit behind the same auth as everything else, so they go through our
 * proxy — but only when the URL really belongs to the configured collection.
 * Proxying an arbitrary URL would turn this server into an open relay.
 */
export function proxyAvatarUrl(imageUrl: string | undefined, adoOrigin: string): string | null {
  if (!imageUrl) return null;
  try {
    if (new URL(imageUrl).origin !== new URL(adoOrigin).origin) return null;
  } catch {
    return null;
  }
  return `/api/avatar?u=${encodeURIComponent(imageUrl)}`;
}

export function toIdentity(raw: unknown, adoOrigin: string): AdoIdentity | null {
  if (!raw || typeof raw !== 'object') return null;
  const identity = raw as RawIdentity;
  const displayName = identity.displayName ?? identity.uniqueName;
  if (!displayName) return null;
  return {
    id: identity.id ?? null,
    displayName,
    avatarUrl: proxyAvatarUrl(identity.imageUrl, adoOrigin),
  };
}

/** ADO stores tags as one semicolon-separated string. */
export function parseTags(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  return raw
    .split(';')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function asNumber(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

function asString(raw: unknown): string | null {
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

export function toCard(raw: RawWorkItem, adoOrigin: string): AdoCard {
  const fields = raw.fields ?? {};
  return {
    id: raw.id,
    title: asString(fields[FIELD.title]) ?? `Work item ${raw.id}`,
    workItemType: asString(fields[FIELD.workItemType]) ?? 'Work Item',
    state: asString(fields[FIELD.state]) ?? 'Unknown',
    column: asString(fields[FIELD.boardColumn]),
    assignedTo: toIdentity(fields[FIELD.assignedTo], adoOrigin),
    tags: parseTags(fields[FIELD.tags]),
    priority: asNumber(fields[FIELD.priority]),
    changedDate: asString(fields[FIELD.changedDate]) ?? new Date(0).toISOString(),
  };
}

/** Turns `System.LinkTypes.Hierarchy-Reverse` into something a person can read. */
export function relationName(rel: string | undefined): string | null {
  if (!rel) return null;
  switch (rel) {
    case 'System.LinkTypes.Hierarchy-Reverse':
      return 'Parent';
    case 'System.LinkTypes.Hierarchy-Forward':
      return 'Child';
    case 'System.LinkTypes.Related':
      return 'Related';
    case 'System.LinkTypes.Duplicate-Forward':
      return 'Duplicate of';
    case 'System.LinkTypes.Duplicate-Reverse':
      return 'Duplicated by';
    case 'Microsoft.VSTS.Common.TestedBy-Forward':
      return 'Tested by';
    default:
      return rel.startsWith('System.LinkTypes.') ? rel.replace('System.LinkTypes.', '') : null;
  }
}

/** Work item id at the end of an ADO work item URL. */
export function workItemIdFromUrl(url: string | undefined): number | null {
  const match = /\/workItems\/(\d+)(?:$|[?#])/i.exec(url ?? '');
  const id = match?.[1] ? Number(match[1]) : NaN;
  return Number.isInteger(id) ? id : null;
}

export function toAttachments(relations: RawRelation[] | undefined): AdoAttachment[] {
  const attachments: AdoAttachment[] = [];
  for (const relation of relations ?? []) {
    if (relation.rel !== 'AttachedFile' || !relation.url) continue;
    const ref = parseAttachmentUrl(relation.url);
    if (!ref) continue;
    const name = relation.attributes?.name ?? ref.fileName ?? 'attachment';
    attachments.push({
      id: ref.id,
      name,
      url: proxyAttachmentUrl({ id: ref.id, fileName: name }),
      sizeBytes: relation.attributes?.resourceSize ?? null,
      isImage: looksLikeImage(name),
    });
  }
  return attachments;
}

export function toRelations(relations: RawRelation[] | undefined): AdoRelation[] {
  const result: AdoRelation[] = [];
  for (const relation of relations ?? []) {
    const name = relationName(relation.rel);
    const workItemId = workItemIdFromUrl(relation.url);
    if (name && workItemId !== null) result.push({ name, workItemId });
  }
  return result;
}

export function toWorkItem(raw: RawWorkItem, adoOrigin: string): AdoWorkItem {
  const fields = raw.fields ?? {};
  return {
    id: raw.id,
    title: asString(fields[FIELD.title]) ?? `Work item ${raw.id}`,
    workItemType: asString(fields[FIELD.workItemType]) ?? 'Work Item',
    state: asString(fields[FIELD.state]) ?? 'Unknown',
    reason: asString(fields[FIELD.reason]),
    areaPath: asString(fields[FIELD.areaPath]),
    iterationPath: asString(fields[FIELD.iterationPath]),
    assignedTo: toIdentity(fields[FIELD.assignedTo], adoOrigin),
    createdBy: toIdentity(fields[FIELD.createdBy], adoOrigin),
    createdDate: asString(fields[FIELD.createdDate]) ?? new Date(0).toISOString(),
    changedDate: asString(fields[FIELD.changedDate]) ?? new Date(0).toISOString(),
    tags: parseTags(fields[FIELD.tags]),
    priority: asNumber(fields[FIELD.priority]),
    // Scrum templates use Effort where Agile uses Story Points.
    storyPoints: asNumber(fields[FIELD.storyPoints]) ?? asNumber(fields[FIELD.effort]),
    descriptionHtml: renderAdoHtml(asString(fields[FIELD.description])),
    reproStepsHtml: renderAdoHtml(asString(fields[FIELD.reproSteps])),
    acceptanceCriteriaHtml: renderAdoHtml(asString(fields[FIELD.acceptanceCriteria])),
    attachments: toAttachments(raw.relations),
    relations: toRelations(raw.relations),
    webUrl: raw._links?.html?.href ?? null,
  };
}
