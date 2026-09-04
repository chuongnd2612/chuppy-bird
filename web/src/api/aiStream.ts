import { FrameDecoder, type AiFrame } from '../../../shared/framing.ts';
import { ApiFailure } from './client.ts';

export interface AnalyzeRequest {
  project: string;
  workItemId: number;
  resumeSessionId?: string;
  question?: string;
}

/**
 * Opens the analysis stream and yields frames as they arrive.
 *
 * The response body is read as bytes, not text: frames are length-prefixed, so
 * a text decoder splitting a multi-byte character across chunks would corrupt
 * the lengths. FrameDecoder handles the reassembly.
 */
export async function* streamAnalysis(
  request: AnalyzeRequest,
  signal: AbortSignal,
): AsyncGenerator<AiFrame> {
  const response = await fetch('/api/ai/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    credentials: 'same-origin',
    signal,
  });

  if (!response.ok) {
    let message = `Analysis failed (${response.status})`;
    let hint: string | undefined;
    try {
      const body = (await response.json()) as { error?: string; hint?: string };
      if (body.error) message = body.error;
      hint = body.hint;
    } catch {
      // Nothing more to learn from a non-JSON error body.
    }
    throw new ApiFailure(message, response.status, hint);
  }
  if (!response.body) throw new ApiFailure('The server returned no stream', 502);

  const reader = response.body.getReader();
  const decoder = new FrameDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) yield* decoder.push(value);
    }
    if (decoder.pending > 0) {
      throw new ApiFailure('The analysis stream ended mid-frame', 502);
    }
  } finally {
    reader.releaseLock();
  }
}

export interface AiStatus {
  enabled: boolean;
  skill: string;
  running: number;
  maxConcurrent: number;
}

export async function fetchAiStatus(): Promise<AiStatus> {
  const response = await fetch('/api/ai/status', { credentials: 'same-origin' });
  if (!response.ok) throw new ApiFailure('Could not read AI status', response.status);
  return (await response.json()) as AiStatus;
}
