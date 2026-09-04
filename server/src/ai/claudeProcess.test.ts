import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config.ts';
import { buildArgs, childEnv, toFrame } from './claudeProcess.ts';

const { config } = loadConfig({
  DEMO_MODE: 'true',
  SESSION_SECRET: 's'.repeat(32),
});

describe('buildArgs', () => {
  const args = buildArgs(
    config,
    { prompt: '/ado-ticket-analyze ticket.json', signal: AbortSignal.abort() },
    'run-uuid',
  );

  it('asks for streaming JSON with partial messages', () => {
    // stream-json is refused without --verbose, and nothing streams without
    // --include-partial-messages; both are easy to lose in a refactor.
    expect(args).toContain('--output-format');
    expect(args).toContain('stream-json');
    expect(args).toContain('--verbose');
    expect(args).toContain('--include-partial-messages');
  });

  it('never leaves a permission prompt waiting for a human', () => {
    expect(args).toContain('--permission-prompts');
    expect(args[args.indexOf('--permission-prompts') + 1]).toBe('none');
    expect(args).toContain('dontAsk');
  });

  it('passes the narrow default tool allowlist', () => {
    const index = args.indexOf('--allowedTools');
    expect(args.slice(index + 1, index + 4)).toEqual(['Read', 'Grep', 'Glob']);
  });

  it('omits the model flag when none is configured', () => {
    expect(args).not.toContain('--model');
  });

  it('includes the model and resume session when configured', () => {
    const { config: withModel } = loadConfig({
      DEMO_MODE: 'true',
      SESSION_SECRET: 's'.repeat(32),
      AI_MODEL: 'opus',
    });
    const resumed = buildArgs(
      withModel,
      { prompt: 'follow up', resumeSessionId: 'abc-123', signal: AbortSignal.abort() },
      'run-uuid',
    );
    expect(resumed[resumed.indexOf('--model') + 1]).toBe('opus');
    expect(resumed[resumed.indexOf('--resume') + 1]).toBe('abc-123');
  });

  it('pins a fresh session id, so resume later targets a known conversation', () => {
    expect(args[args.indexOf('--session-id') + 1]).toBe('run-uuid');
  });

  it('never sends --session-id alongside --resume, which the CLI refuses', () => {
    const resumed = buildArgs(
      config,
      { prompt: 'follow up', resumeSessionId: 'abc-123', signal: AbortSignal.abort() },
      'run-uuid',
    );
    expect(resumed).not.toContain('--session-id');
  });
});

describe('childEnv', () => {
  it('strips our secrets, so the model process cannot reach the PAT', () => {
    const env = childEnv({ ADO_PAT: 'secret', APP_PASSWORD: 'pw', SESSION_SECRET: 's', PATH: '/usr/bin' });
    expect(env.ADO_PAT).toBeUndefined();
    expect(env.APP_PASSWORD).toBeUndefined();
    expect(env.SESSION_SECRET).toBeUndefined();
    expect(env.PATH).toBe('/usr/bin');
  });
});

describe('toFrame', () => {
  it('turns the init event into a start frame', () => {
    const state = { model: null as string | null };
    expect(toFrame({ type: 'system', subtype: 'init', session_id: 'sess-1' }, state)).toEqual({
      t: 'start',
      sessionId: 'sess-1',
    });
  });

  it('reports the model once the turn starts', () => {
    const state = { model: null as string | null };
    const event = { type: 'stream_event', event: { type: 'message_start', message: { model: 'claude-opus-5' } } };

    expect(toFrame(event, state)).toEqual({ t: 'model', model: 'claude-opus-5' });
    // A resumed turn repeats message_start; the client should not see it twice.
    expect(toFrame(event, state)).toBeNull();
  });

  it('emits text deltas', () => {
    const state = { model: null as string | null };
    expect(
      toFrame(
        { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi' } } },
        state,
      ),
    ).toEqual({ t: 'delta', text: 'Hi' });
  });

  it('ignores thinking deltas rather than mixing them into the answer', () => {
    const state = { model: null as string | null };
    expect(
      toFrame(
        { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'thinking_delta', text: 'hmm' } } },
        state,
      ),
    ).toBeNull();
  });

  it('reports a tool starting', () => {
    const state = { model: null as string | null };
    expect(
      toFrame(
        { type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'tool_use', name: 'Read' } } },
        state,
      ),
    ).toEqual({ t: 'tool', name: 'Read', status: 'started' });
  });

  it('recognises the final result by its cost field, not only its type', () => {
    const state = { model: null as string | null };
    expect(
      toFrame(
        { total_cost_usd: 0.13, stop_reason: 'end_turn', usage: { input_tokens: 2, output_tokens: 4 } },
        state,
      ),
    ).toEqual({ t: 'done', costUsd: 0.13, inputTokens: 2, outputTokens: 4, stopReason: 'end_turn' });
  });

  it('ignores the noise events the CLI also emits', () => {
    const state = { model: null as string | null };
    expect(toFrame({ type: 'active_goal' }, state)).toBeNull();
    expect(toFrame({ type: 'rate_limit_event' }, state)).toBeNull();
    expect(toFrame({ type: 'stream_event', event: { type: 'message_stop' } }, state)).toBeNull();
  });
});
