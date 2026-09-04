import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { makeWorkItem } from '../../../shared/fixtures.ts';
import { loadConfig } from '../config.ts';
import { buildTicketContext, htmlToText, renderPrompt, writeTicketFile, workspaceDir } from './prompt.ts';

const { config } = loadConfig({ DEMO_MODE: 'true', SESSION_SECRET: 's'.repeat(32) });

describe('htmlToText', () => {
  it('turns list markup into readable lines', () => {
    expect(htmlToText('<ol><li>First</li><li>Second</li></ol>')).toBe('- First\n- Second');
  });

  it('unescapes entities and drops tags', () => {
    expect(htmlToText('<p>a &amp; b &lt;c&gt;</p>')).toBe('a & b <c>');
  });

  it('returns null for empty or markup-only input', () => {
    expect(htmlToText(null)).toBeNull();
    expect(htmlToText('<p>&nbsp;</p>')).toBeNull();
  });
});

describe('buildTicketContext', () => {
  it('flattens the work item and its thread into plain text', () => {
    const context = buildTicketContext(makeWorkItem(), [
      {
        id: 1,
        html: '<div>Reproduced on staging.</div>',
        createdBy: { id: 'u1', displayName: 'Mai Tran', avatarUrl: null },
        createdDate: '2026-08-21T04:00:00Z',
        modifiedDate: null,
      },
    ]);

    expect(context.title).toBe('Card payments time out under load');
    expect(context.description).toContain('Checkout returns 504');
    expect(context.reproSteps).toContain('- Run the load profile');
    expect(context.comments[0]).toMatchObject({ author: 'Mai Tran', text: 'Reproduced on staging.' });
    expect(context.attachments).toEqual(['latency.png']);
  });

  it('carries no HTML through to the skill', () => {
    const context = buildTicketContext(makeWorkItem(), []);
    expect(JSON.stringify(context)).not.toMatch(/<[a-z]/i);
  });
});

describe('writeTicketFile', () => {
  it('writes readable JSON named after the work item', async () => {
    const context = buildTicketContext(makeWorkItem({ id: 4242 }), []);
    const path = await writeTicketFile(config, context);

    expect(path).toBe(`${workspaceDir(config)}/work-item-4242.json`);
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ id: 4242 });
  });
});

describe('renderPrompt', () => {
  it('substitutes the skill and file into the template', () => {
    expect(renderPrompt(config, '/tmp/x/work-item-1.json')).toBe(
      '/ado-ticket-analyze /tmp/x/work-item-1.json',
    );
  });

  it('honours a custom template', () => {
    const { config: custom } = loadConfig({
      DEMO_MODE: 'true',
      SESSION_SECRET: 's'.repeat(32),
      AI_SKILL: 'my-skill',
      AI_PROMPT_TEMPLATE: 'Use /{skill} on {file} and be terse.',
    });
    expect(renderPrompt(custom, '/t/a.json')).toBe('Use /my-skill on /t/a.json and be terse.');
  });
});
