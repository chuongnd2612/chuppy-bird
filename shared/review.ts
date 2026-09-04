import type { AdoWorkItem, Finding, Review } from './types.ts';

/**
 * A cheap, offline "definition of ready" check.
 *
 * This runs on data we already have, costs nothing, and gives every card a
 * badge without waiting on (or paying for) the Claude analysis. It is a
 * spell-check, not a review — the AI pass is what actually reads the ticket.
 */

const MIN_TITLE_LENGTH = 10;
const MIN_DESCRIPTION_LENGTH = 40;

/** Work item types we expect to carry acceptance criteria. */
const TYPES_NEEDING_CRITERIA = new Set([
  'user story',
  'product backlog item',
  'feature',
  'requirement',
]);

/** Rough text length of an HTML field — enough to tell "empty" from "written". */
export function htmlTextLength(html: string | null): number {
  if (!html) return 0;
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&[a-z]+;/gi, 'x')
    .trim().length;
}

const rules: Array<(item: AdoWorkItem) => Finding | null> = [
  (item) =>
    item.title.trim().length >= MIN_TITLE_LENGTH
      ? null
      : {
          rule: 'title-too-short',
          severity: 'error',
          message: `Title is under ${MIN_TITLE_LENGTH} characters — say what changes and where.`,
        },
  (item) =>
    htmlTextLength(item.descriptionHtml) + htmlTextLength(item.reproStepsHtml) >=
    MIN_DESCRIPTION_LENGTH
      ? null
      : {
          rule: 'description-too-short',
          severity: 'error',
          message: 'Neither the description nor the repro steps explain the problem.',
        },
  (item) =>
    !TYPES_NEEDING_CRITERIA.has(item.workItemType.toLowerCase()) ||
    htmlTextLength(item.acceptanceCriteriaHtml) > 0
      ? null
      : {
          rule: 'missing-acceptance-criteria',
          severity: 'error',
          message: `No acceptance criteria on a ${item.workItemType} — no way to tell when it is done.`,
        },
  (item) =>
    item.assignedTo
      ? null
      : { rule: 'unassigned', severity: 'warning', message: 'Nobody is assigned.' },
  (item) =>
    item.storyPoints !== null || item.priority !== null
      ? null
      : {
          rule: 'unsized',
          severity: 'warning',
          message: 'Neither story points nor priority are set.',
        },
];

export function reviewWorkItem(item: AdoWorkItem): Review {
  const findings = rules.map((rule) => rule(item)).filter((f): f is Finding => f !== null);
  return { workItemId: item.id, findings };
}

/** Warnings alone do not fail a work item; errors do. */
export function passes(review: Review): boolean {
  return review.findings.every((finding) => finding.severity !== 'error');
}
