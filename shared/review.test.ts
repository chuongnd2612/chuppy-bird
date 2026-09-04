import { describe, expect, it } from 'vitest';
import { makeWorkItem } from './fixtures.ts';
import { htmlTextLength, passes, reviewWorkItem } from './review.ts';

describe('htmlTextLength', () => {
  it('measures visible text, not markup', () => {
    expect(htmlTextLength('<div><b>hi</b></div>')).toBe(2);
    expect(htmlTextLength('<p>&nbsp;</p>')).toBe(0);
    expect(htmlTextLength(null)).toBe(0);
  });
});

describe('reviewWorkItem', () => {
  it('passes a bug with a description, an assignee and a priority', () => {
    expect(reviewWorkItem(makeWorkItem()).findings).toEqual([]);
  });

  it('does not demand acceptance criteria from a Bug', () => {
    const review = reviewWorkItem(makeWorkItem({ acceptanceCriteriaHtml: null }));
    expect(review.findings.map((f) => f.rule)).not.toContain('missing-acceptance-criteria');
  });

  it('does demand acceptance criteria from a User Story', () => {
    const review = reviewWorkItem(
      makeWorkItem({ workItemType: 'User Story', acceptanceCriteriaHtml: null }),
    );
    expect(review.findings.map((f) => f.rule)).toContain('missing-acceptance-criteria');
    expect(passes(review)).toBe(false);
  });

  it('accepts repro steps in place of a description', () => {
    const review = reviewWorkItem(
      makeWorkItem({
        descriptionHtml: null,
        reproStepsHtml: '<ol><li>Run the load profile at 800 rps and watch the gateway</li></ol>',
      }),
    );
    expect(review.findings.map((f) => f.rule)).not.toContain('description-too-short');
  });

  it('treats an unassigned, unsized item as warnings only', () => {
    const review = reviewWorkItem(makeWorkItem({ assignedTo: null, priority: null, storyPoints: null }));
    expect(review.findings.map((f) => f.rule)).toEqual(['unassigned', 'unsized']);
    expect(passes(review)).toBe(true);
  });

  it('flags every blocking gap on an empty user story', () => {
    const review = reviewWorkItem(
      makeWorkItem({
        title: 'Fix it',
        workItemType: 'User Story',
        descriptionHtml: null,
        reproStepsHtml: null,
        acceptanceCriteriaHtml: null,
      }),
    );
    expect(review.findings.map((f) => f.rule)).toEqual([
      'title-too-short',
      'description-too-short',
      'missing-acceptance-criteria',
    ]);
  });
});
