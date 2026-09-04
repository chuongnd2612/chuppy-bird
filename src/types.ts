/** A ticket pulled in from an issue tracker, normalised to the fields we review. */
export interface Ticket {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  labels: string[];
  estimate: number | null;
}

export type Severity = 'error' | 'warning';

/** One thing the reviewer flagged about a ticket. */
export interface Finding {
  rule: string;
  severity: Severity;
  message: string;
}

export interface Review {
  ticketId: string;
  findings: Finding[];
}
