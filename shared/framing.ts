/**
 * Length-prefixed framing for the AI stream.
 *
 *   Frame := LENGTH (4 bytes, big-endian uint32) ‖ PAYLOAD (LENGTH bytes, UTF-8 JSON)
 *
 * Why not SSE: the payloads carry arbitrary model output, and SSE would mean
 * escaping newlines and trusting a blank-line delimiter to survive whatever
 * chunking a tunnel applies. A length prefix says exactly how many bytes to
 * read, so a frame either arrives whole or is still incomplete — there is no
 * third state to get wrong.
 *
 * Written against Uint8Array rather than Buffer so the same code runs on the
 * server and in the browser.
 */

/** Refuse anything larger, rather than buffering without limit. */
export const MAX_FRAME_BYTES = 1024 * 1024;

export const HEADER_BYTES = 4;

export type AiFrame =
  | { t: 'start'; sessionId: string }
  /** Arrives once the turn begins; the model is not known at start. */
  | { t: 'model'; model: string }
  | { t: 'delta'; text: string }
  | { t: 'tool'; name: string; status: 'started' | 'finished' }
  | { t: 'done'; costUsd: number | null; inputTokens: number | null; outputTokens: number | null; stopReason: string | null }
  | { t: 'error'; message: string };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeFrame(frame: AiFrame): Uint8Array {
  const payload = encoder.encode(JSON.stringify(frame));
  if (payload.byteLength > MAX_FRAME_BYTES) {
    throw new RangeError(`Frame of ${payload.byteLength} bytes exceeds the ${MAX_FRAME_BYTES} byte limit`);
  }

  const out = new Uint8Array(HEADER_BYTES + payload.byteLength);
  new DataView(out.buffer).setUint32(0, payload.byteLength, false);
  out.set(payload, HEADER_BYTES);
  return out;
}

export class FrameTooLargeError extends Error {
  constructor(size: number) {
    super(`Frame of ${size} bytes exceeds the ${MAX_FRAME_BYTES} byte limit`);
    this.name = 'FrameTooLargeError';
  }
}

/**
 * Accumulates arbitrary chunks and yields whole frames.
 *
 * Chunk boundaries mean nothing: a single read can split the 4-byte header, or
 * deliver six frames at once. Both are normal, and both are covered by tests.
 */
export class FrameDecoder {
  #buffer = new Uint8Array(0);

  push(chunk: Uint8Array): AiFrame[] {
    const combined = new Uint8Array(this.#buffer.byteLength + chunk.byteLength);
    combined.set(this.#buffer, 0);
    combined.set(chunk, this.#buffer.byteLength);
    this.#buffer = combined;

    const frames: AiFrame[] = [];
    for (;;) {
      if (this.#buffer.byteLength < HEADER_BYTES) break;

      const view = new DataView(this.#buffer.buffer, this.#buffer.byteOffset, this.#buffer.byteLength);
      const length = view.getUint32(0, false);
      if (length > MAX_FRAME_BYTES) throw new FrameTooLargeError(length);
      if (this.#buffer.byteLength < HEADER_BYTES + length) break;

      const payload = this.#buffer.subarray(HEADER_BYTES, HEADER_BYTES + length);
      frames.push(JSON.parse(decoder.decode(payload)) as AiFrame);
      this.#buffer = this.#buffer.slice(HEADER_BYTES + length);
    }
    return frames;
  }

  /** Bytes held back waiting for the rest of a frame; non-zero means truncation. */
  get pending(): number {
    return this.#buffer.byteLength;
  }
}
