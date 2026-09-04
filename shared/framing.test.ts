import { describe, expect, it } from 'vitest';
import {
  encodeFrame,
  FrameDecoder,
  FrameTooLargeError,
  HEADER_BYTES,
  MAX_FRAME_BYTES,
  type AiFrame,
} from './framing.ts';

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

const delta = (text: string): AiFrame => ({ t: 'delta', text });

describe('encodeFrame', () => {
  it('writes a big-endian length header followed by the JSON payload', () => {
    const encoded = encodeFrame(delta('hi'));
    const length = new DataView(encoded.buffer).getUint32(0, false);

    expect(length).toBe(encoded.byteLength - HEADER_BYTES);
    expect(JSON.parse(new TextDecoder().decode(encoded.subarray(HEADER_BYTES)))).toEqual(delta('hi'));
  });

  it('measures the length in bytes, not characters', () => {
    // A frame counted in UTF-16 code units would truncate this on the wire.
    const encoded = encodeFrame(delta('cà phê 🇻🇳'));
    const length = new DataView(encoded.buffer).getUint32(0, false);
    expect(length).toBe(encoded.byteLength - HEADER_BYTES);
    expect(new FrameDecoder().push(encoded)).toEqual([delta('cà phê 🇻🇳')]);
  });

  it('refuses to encode beyond the frame limit', () => {
    expect(() => encodeFrame(delta('x'.repeat(MAX_FRAME_BYTES + 1)))).toThrow(RangeError);
  });
});

describe('FrameDecoder', () => {
  it('round-trips a single frame', () => {
    expect(new FrameDecoder().push(encodeFrame(delta('hello')))).toEqual([delta('hello')]);
  });

  it('yields several frames delivered in one chunk', () => {
    const chunk = concat(encodeFrame(delta('a')), encodeFrame(delta('b')), encodeFrame(delta('c')));
    expect(new FrameDecoder().push(chunk)).toEqual([delta('a'), delta('b'), delta('c')]);
  });

  it('reassembles a frame split across chunks', () => {
    const encoded = encodeFrame(delta('split me'));
    const decoder = new FrameDecoder();

    expect(decoder.push(encoded.subarray(0, 6))).toEqual([]);
    expect(decoder.push(encoded.subarray(6))).toEqual([delta('split me')]);
  });

  it('handles a header split mid-way, which a tunnel can do', () => {
    const encoded = encodeFrame(delta('x'));
    const decoder = new FrameDecoder();

    expect(decoder.push(encoded.subarray(0, 2))).toEqual([]);
    expect(decoder.push(encoded.subarray(2, 3))).toEqual([]);
    expect(decoder.push(encoded.subarray(3))).toEqual([delta('x')]);
  });

  it('survives byte-at-a-time delivery', () => {
    const encoded = concat(encodeFrame(delta('one')), encodeFrame(delta('two')));
    const decoder = new FrameDecoder();
    const frames: AiFrame[] = [];

    for (const byte of encoded) frames.push(...decoder.push(new Uint8Array([byte])));
    expect(frames).toEqual([delta('one'), delta('two')]);
    expect(decoder.pending).toBe(0);
  });

  it('keeps a trailing partial frame pending rather than emitting it', () => {
    const encoded = concat(encodeFrame(delta('done')), encodeFrame(delta('cut')).subarray(0, 5));
    const decoder = new FrameDecoder();

    expect(decoder.push(encoded)).toEqual([delta('done')]);
    expect(decoder.pending).toBeGreaterThan(0);
  });

  it('rejects a declared length beyond the limit instead of buffering it', () => {
    const bogus = new Uint8Array(HEADER_BYTES);
    new DataView(bogus.buffer).setUint32(0, MAX_FRAME_BYTES + 1, false);
    expect(() => new FrameDecoder().push(bogus)).toThrow(FrameTooLargeError);
  });

  it('carries every frame type through unchanged', () => {
    const frames: AiFrame[] = [
      { t: 'start', sessionId: 'abc' },
      { t: 'model', model: 'claude-opus-5' },
      { t: 'tool', name: 'Read', status: 'started' },
      { t: 'done', costUsd: 0.13, inputTokens: 2, outputTokens: 4, stopReason: 'end_turn' },
      { t: 'error', message: 'boom' },
    ];
    const decoder = new FrameDecoder();
    expect(decoder.push(concat(...frames.map(encodeFrame)))).toEqual(frames);
  });
});
