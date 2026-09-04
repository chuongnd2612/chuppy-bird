import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createInterface } from 'node:readline';

import type { AiFrame } from '../../../shared/framing.ts';
import type { Config } from '../config.ts';

/**
 * Runs the Claude CLI and turns its NDJSON stream into our frames.
 *
 * The CLI is the integration point on purpose: it already carries the user's
 * auth, their settings, and the `ado-ticket-analyze` skill. Reimplementing any
 * of that against the API would drift from what they get in a terminal.
 */

export interface ClaudeRunOptions {
  prompt: string;
  /** Passed as --resume to continue an earlier analysis of the same ticket. */
  resumeSessionId?: string | undefined;
  signal: AbortSignal;
}

export function buildArgs(config: Config, options: ClaudeRunOptions, sessionId: string): string[] {
  const args = [
    '-p',
    options.prompt,
    '--output-format',
    'stream-json',
    // stream-json is refused without this.
    '--verbose',
    // Token-level deltas; without it nothing appears until the turn ends.
    '--include-partial-messages',
    '--permission-mode',
    config.AI_PERMISSION_MODE,
    // Nobody is at a terminal to answer a prompt, so anything that would ask
    // is denied rather than hanging until the timeout.
    '--permission-prompts',
    'none',
  ];

  const allowed = config.AI_ALLOWED_TOOLS.split(',')
    .map((tool) => tool.trim())
    .filter(Boolean);
  if (allowed.length > 0) args.push('--allowedTools', ...allowed);

  if (config.AI_MODEL) args.push('--model', config.AI_MODEL);

  // Pinning the id makes resume deterministic and stops the CLI from adopting
  // whatever ambient session the working directory happens to carry. The two
  // flags are mutually exclusive.
  if (options.resumeSessionId) args.push('--resume', options.resumeSessionId);
  else args.push('--session-id', sessionId);

  return args;
}

/**
 * The child must not inherit our secrets. It runs a model with tool access; the
 * PAT and the app password have no business being reachable from it.
 */
export function childEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const copy = { ...env };
  for (const key of ['ADO_PAT', 'APP_PASSWORD', 'SESSION_SECRET']) delete copy[key];
  return copy;
}

interface StreamEvent {
  type?: string;
  subtype?: string;
  session_id?: string;
  total_cost_usd?: number;
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  event?: {
    type?: string;
    delta?: { type?: string; text?: string };
    content_block?: { type?: string; name?: string };
    message?: { model?: string };
  };
}

/** Maps one CLI event to a frame, or null for the events we do not surface. */
export function toFrame(event: StreamEvent, state: { model: string | null }): AiFrame | null {
  if (event.type === 'system' && event.subtype === 'init' && event.session_id) {
    return { t: 'start', sessionId: event.session_id };
  }

  if (event.type === 'stream_event') {
    const inner = event.event;
    if (inner?.type === 'message_start' && inner.message?.model) {
      // Reported once per turn; a resumed run repeats it, so only the first
      // becomes a frame.
      if (state.model === inner.message.model) return null;
      state.model = inner.message.model;
      return { t: 'model', model: inner.message.model };
    }
    if (inner?.type === 'content_block_delta' && inner.delta?.type === 'text_delta') {
      return { t: 'delta', text: inner.delta.text ?? '' };
    }
    if (inner?.type === 'content_block_start' && inner.content_block?.type === 'tool_use') {
      return { t: 'tool', name: inner.content_block.name ?? 'tool', status: 'started' };
    }
    return null;
  }

  // The final event carries the cost. It is identified by the field rather than
  // the type, which has changed shape across CLI versions.
  if (event.type === 'result' || typeof event.total_cost_usd === 'number') {
    return {
      t: 'done',
      costUsd: event.total_cost_usd ?? null,
      inputTokens: event.usage?.input_tokens ?? null,
      outputTokens: event.usage?.output_tokens ?? null,
      stopReason: event.stop_reason ?? null,
    };
  }

  return null;
}

export async function* runClaude(
  config: Config,
  options: ClaudeRunOptions,
): AsyncGenerator<AiFrame> {
  const sessionId = randomUUID();
  const child = spawn(config.CLAUDE_BIN, buildArgs(config, options, sessionId), {
    cwd: config.AI_WORKSPACE_DIR || process.cwd(),
    env: childEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
    // Its own process group, so aborting kills any subprocess it started too.
    detached: true,
  });

  const stderr: string[] = [];
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (text: string) => {
    stderr.push(text);
    // Keep the tail only; a runaway child should not grow the heap.
    if (stderr.length > 50) stderr.splice(0, stderr.length - 50);
  });

  const timeout = setTimeout(() => kill(child.pid, 'SIGTERM'), config.AI_TIMEOUT_MS);
  const onAbort = () => kill(child.pid, 'SIGTERM');
  options.signal.addEventListener('abort', onAbort, { once: true });

  const state = { model: null as string | null };
  let sawDone = false;

  try {
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    for await (const line of lines) {
      if (!line.trim()) continue;

      let event: StreamEvent;
      try {
        event = JSON.parse(line) as StreamEvent;
      } catch {
        // A non-JSON line is CLI chatter, not a protocol violation.
        continue;
      }

      const frame = toFrame(event, state);
      if (!frame) continue;
      if (frame.t === 'done') sawDone = true;
      yield frame;
    }

    const [code] = (await once(child, 'close')) as [number | null];
    if (options.signal.aborted) return;

    if (!sawDone) {
      const detail = stderr.join('').trim().split('\n').slice(-3).join(' ').slice(0, 500);
      yield {
        t: 'error',
        message:
          code === 0
            ? 'Claude exited without returning a result.'
            : `Claude exited with code ${code}${detail ? `: ${detail}` : ''}`,
      };
    }
  } finally {
    clearTimeout(timeout);
    options.signal.removeEventListener('abort', onAbort);
    kill(child.pid, 'SIGKILL');
  }
}

/** Signals the whole process group; a bare child kill can orphan its children. */
function kill(pid: number | undefined, signal: NodeJS.Signals): void {
  if (pid === undefined) return;
  try {
    process.kill(-pid, signal);
  } catch {
    // Already gone, or never started — nothing to clean up.
  }
}
