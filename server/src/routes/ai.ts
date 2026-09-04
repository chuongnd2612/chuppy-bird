import { PassThrough } from 'node:stream';

import type { FastifyInstance } from 'fastify';

import { encodeFrame, type AiFrame } from '../../../shared/framing.ts';
import { runClaude } from '../ai/claudeProcess.ts';
import { ConcurrencyLimiter } from '../ai/limiter.ts';
import { buildTicketContext, renderPrompt, writeTicketFile } from '../ai/prompt.ts';
import type { TicketSource } from '../ado/service.ts';

interface AnalyzeBody {
  project?: string;
  workItemId?: number;
  /** Continues an earlier analysis of the same ticket. */
  resumeSessionId?: string;
  /** A follow-up question; without it the skill is invoked from scratch. */
  question?: string;
}

export async function registerAiRoutes(app: FastifyInstance, source: TicketSource): Promise<void> {
  const config = app.config;
  const limiter = new ConcurrencyLimiter(config.AI_MAX_CONCURRENT);

  app.get('/api/ai/status', async () => ({
    enabled: config.AI_ENABLED,
    skill: config.AI_SKILL,
    running: limiter.active,
    maxConcurrent: config.AI_MAX_CONCURRENT,
  }));

  app.post<{ Body: AnalyzeBody }>('/api/ai/analyze', async (request, reply) => {
    if (!config.AI_ENABLED) {
      return reply.code(503).send({ error: 'Claude analysis is disabled (AI_ENABLED=false)' });
    }

    const { project, workItemId, resumeSessionId, question } = request.body ?? {};
    if (!project || typeof workItemId !== 'number' || !Number.isInteger(workItemId)) {
      return reply.code(400).send({ error: 'project and workItemId are required' });
    }

    const release = limiter.tryAcquire();
    if (!release) {
      return reply.code(429).send({
        error: 'An analysis is already running',
        hint: 'Wait for it to finish, or raise AI_MAX_CONCURRENT.',
      });
    }

    // Build the prompt before the response starts, so a failure here is still a
    // clean JSON error rather than an error frame inside a half-written stream.
    let prompt: string;
    try {
      if (question && resumeSessionId) {
        prompt = question;
      } else {
        const [item, comments] = await Promise.all([
          source.getWorkItem(project, workItemId),
          source.listComments(project, workItemId),
        ]);
        const path = await writeTicketFile(config, buildTicketContext(item, comments));
        prompt = renderPrompt(config, path);
      }
    } catch (error) {
      release();
      throw error;
    }

    const controller = new AbortController();
    const stream = new PassThrough();

    reply
      .header('content-type', 'application/octet-stream')
      .header('cache-control', 'no-store')
      .header('x-content-type-options', 'nosniff')
      // Length-prefixed frames must not be re-chunked or buffered by a proxy.
      .header('x-accel-buffering', 'no');

    reply.raw.on('close', () => {
      if (!reply.raw.writableFinished) controller.abort();
    });

    const write = (frame: AiFrame) => {
      if (!stream.writableEnded) stream.write(encodeFrame(frame));
    };

    // Deliberately not awaited: the reply must return the stream immediately.
    void (async () => {
      try {
        for await (const frame of runClaude(config, {
          prompt,
          resumeSessionId,
          signal: controller.signal,
        })) {
          write(frame);
        }
      } catch (error) {
        request.log.error({ err: error }, 'claude analysis failed');
        const message = error instanceof Error ? error.message : String(error);
        write({
          t: 'error',
          message: message.includes('ENOENT')
            ? `Could not start "${config.CLAUDE_BIN}". Is the Claude CLI installed on this machine and on PATH?`
            : message,
        });
      } finally {
        release();
        stream.end();
      }
    })();

    return reply.send(stream);
  });
}
