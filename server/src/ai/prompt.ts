import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AdoComment, AdoWorkItem } from '../../../shared/types.ts';
import type { Config } from '../config.ts';

/**
 * Builds what the skill actually reads.
 *
 * The work item goes to disk as JSON rather than into the prompt: a ticket with
 * a long thread would otherwise dominate the prompt, and a file is what a skill
 * can re-read as it works.
 */

/** Rough HTML-to-text. The skill wants prose, not our sanitized markup. */
export function htmlToText(html: string | null): string | null {
  if (!html) return null;
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|tr|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim() || null;
}

export interface TicketContext {
  id: number;
  title: string;
  workItemType: string;
  state: string;
  assignedTo: string | null;
  iterationPath: string | null;
  tags: string[];
  storyPoints: number | null;
  priority: number | null;
  description: string | null;
  reproSteps: string | null;
  acceptanceCriteria: string | null;
  attachments: string[];
  relations: Array<{ name: string; workItemId: number }>;
  comments: Array<{ author: string; createdDate: string; text: string | null }>;
  webUrl: string | null;
}

export function buildTicketContext(item: AdoWorkItem, comments: AdoComment[]): TicketContext {
  return {
    id: item.id,
    title: item.title,
    workItemType: item.workItemType,
    state: item.state,
    assignedTo: item.assignedTo?.displayName ?? null,
    iterationPath: item.iterationPath,
    tags: item.tags,
    storyPoints: item.storyPoints,
    priority: item.priority,
    description: htmlToText(item.descriptionHtml),
    reproSteps: htmlToText(item.reproStepsHtml),
    acceptanceCriteria: htmlToText(item.acceptanceCriteriaHtml),
    attachments: item.attachments.map((attachment) => attachment.name),
    relations: item.relations,
    comments: comments.map((comment) => ({
      author: comment.createdBy.displayName,
      createdDate: comment.createdDate,
      text: htmlToText(comment.html),
    })),
    webUrl: item.webUrl,
  };
}

export function workspaceDir(config: Config): string {
  return config.AI_WORKSPACE_DIR || join(tmpdir(), 'ado-ticket-reviewer');
}

/** Writes the context and returns its path. One file per work item, overwritten. */
export async function writeTicketFile(config: Config, context: TicketContext): Promise<string> {
  const directory = workspaceDir(config);
  await mkdir(directory, { recursive: true });
  const path = join(directory, `work-item-${context.id}.json`);
  await writeFile(path, JSON.stringify(context, null, 2), 'utf8');
  return path;
}

export function renderPrompt(config: Config, filePath: string): string {
  return config.AI_PROMPT_TEMPLATE.replaceAll('{skill}', config.AI_SKILL).replaceAll('{file}', filePath);
}
