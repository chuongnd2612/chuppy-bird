import { deflateSync } from 'node:zlib';

import type { FastifyInstance } from 'fastify';

/**
 * DEMO_MODE has no PAT, so there is nothing to proxy attachments with — but a
 * demo that shows broken images fails to demonstrate the one thing this app
 * exists to do. These routes synthesise a placeholder PNG instead.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

/** A minimal RGB PNG encoder — enough for a placeholder, no dependency needed. */
export function encodePng(width: number, height: number, pixel: (x: number, y: number) => [number, number, number]): Buffer {
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      const offset = y * stride + 1 + x * 3;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A latency-chart-shaped placeholder, so the demo screenshot looks like one. */
function placeholderChart(): Buffer {
  const width = 640;
  const height = 360;
  const series = (x: number) => {
    const t = x / width;
    const spike = t > 0.62 ? (t - 0.62) * 3.4 : 0;
    return 0.72 - Math.sin(t * 7) * 0.06 - spike;
  };

  return encodePng(width, height, (x, y) => {
    const gridline = x % 64 === 0 || y % 45 === 0;
    const lineY = series(x) * height;
    if (Math.abs(y - lineY) < 2.2) return [0, 120, 212];
    if (y > lineY && Math.abs(y - lineY) < 60) return [225, 238, 250];
    if (gridline) return [232, 232, 232];
    return [252, 252, 252];
  });
}

export async function registerDemoMediaRoutes(app: FastifyInstance): Promise<void> {
  const png = placeholderChart();

  app.get('/api/attachments/:id', async (_request, reply) =>
    reply
      .header('content-type', 'image/png')
      .header('cache-control', 'private, max-age=60')
      .header('x-content-type-options', 'nosniff')
      .send(png),
  );

  app.get('/api/avatar', async (_request, reply) => reply.code(404).send({ error: 'No avatars in demo mode' }));
}
