/**
 * Types shared by the Fastify server and the React client.
 *
 * These are *our* shapes, not Azure DevOps' — the server narrows the very wide
 * ADO payloads down to what the UI actually renders, so the phone never has to
 * download a work item's full field bag.
 */

export interface AdoProject {
  id: string;
  name: string;
  description: string | null;
}

export interface AdoTeam {
  id: string;
  name: string;
}

export interface AdoBoardRef {
  id: string;
  name: string;
}

export interface AdoBoardColumn {
  id: string;
  name: string;
  /** ADO's own ordering; the UI renders columns in this order. */
  order: number;
  itemLimit: number;
}

export interface AdoIdentity {
  id: string | null;
  displayName: string;
  /** Proxied through our server — ADO avatar URLs need auth. */
  avatarUrl: string | null;
}

/** A work item as rendered on a board card. Deliberately small. */
export interface AdoCard {
  id: number;
  title: string;
  workItemType: string;
  state: string;
  /** Board column the card currently sits in, when the board reports one. */
  column: string | null;
  assignedTo: AdoIdentity | null;
  tags: string[];
  priority: number | null;
  changedDate: string;
}

export interface AdoBoard {
  id: string;
  name: string;
  columns: AdoBoardColumn[];
  cards: AdoCard[];
}

export interface AdoAttachment {
  id: string;
  name: string;
  /** Our proxy URL, never the raw ADO one. */
  url: string;
  /** ADO does not always report a size; null when unknown. */
  sizeBytes: number | null;
  isImage: boolean;
}

export interface AdoComment {
  id: number;
  /** Sanitized HTML with attachment URLs already rewritten onto our proxy. */
  html: string;
  createdBy: AdoIdentity;
  createdDate: string;
  modifiedDate: string | null;
}

export interface AdoRelation {
  /** Human-readable link type, e.g. "Parent", "Child", "Related". */
  name: string;
  workItemId: number;
}

/** A work item in full, as shown on the detail screen. */
export interface AdoWorkItem {
  id: number;
  title: string;
  workItemType: string;
  state: string;
  reason: string | null;
  areaPath: string | null;
  iterationPath: string | null;
  assignedTo: AdoIdentity | null;
  createdBy: AdoIdentity | null;
  createdDate: string;
  changedDate: string;
  tags: string[];
  priority: number | null;
  storyPoints: number | null;
  /** Sanitized, proxy-rewritten HTML. Null when the field is empty. */
  descriptionHtml: string | null;
  reproStepsHtml: string | null;
  acceptanceCriteriaHtml: string | null;
  attachments: AdoAttachment[];
  relations: AdoRelation[];
  /** Link back to the real work item in ADO, for when VPN is available. */
  webUrl: string | null;
}

export interface ApiError {
  error: string;
  /** Present when we can tell the user how to fix it (bad PAT, missing scope). */
  hint?: string;
}

export type Severity = 'error' | 'warning';

/** One gap the offline readiness check found in a work item. */
export interface Finding {
  rule: string;
  severity: Severity;
  message: string;
}

export interface Review {
  workItemId: number;
  findings: Finding[];
}
