import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/**
 * Creates a PNG buffer from raw RGBA pixel data.
 */
function createPng(width: number, height: number, rgbaBuffer: Buffer): Buffer {
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // 8 bits per channel
  ihdr.writeUInt8(6, 9); // RGBA
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace

  const ihdrChunk = createChunk('IHDR', ihdr);

  // Raw Scanlines: (1 filter byte + width * 4 bytes) per row
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 4);
    scanlines[rowOffset] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const srcOffset = (y * width + x) * 4;
      const dstOffset = rowOffset + 1 + x * 4;
      scanlines[dstOffset] = rgbaBuffer[srcOffset]!; // R
      scanlines[dstOffset + 1] = rgbaBuffer[srcOffset + 1]!; // G
      scanlines[dstOffset + 2] = rgbaBuffer[srcOffset + 2]!; // B
      scanlines[dstOffset + 3] = rgbaBuffer[srcOffset + 3]!; // A
    }
  }

  const compressedData = zlib.deflateSync(scanlines);
  const idatChunk = createChunk('IDAT', compressedData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([pngHeader, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type: string, data: Buffer): Buffer {
  const len = data.length;
  const chunk = Buffer.alloc(4 + 4 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);

  const crc = calculateCrc32(chunk.subarray(4, 8 + len));
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

function calculateCrc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i]!;
    crc ^= byte;
    for (let j = 0; j < 8; j++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Draws the Tessera logo:
 * Dark rounded shield with a vibrant glowing cyan-indigo crystal bookmark motif.
 */
function drawTesseraIcon(size: number): Buffer {
  const buf = Buffer.alloc(size * size * 4);

  const center = size / 2;
  const radius = size * 0.44;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      // Distance from center for rounded corner base
      const nx = (x - center) / (size * 0.45);
      const ny = (y - center) / (size * 0.45);
      const distSquircle = Math.pow(Math.abs(nx), 3.5) + Math.pow(Math.abs(ny), 3.5);

      if (distSquircle <= 1.0) {
        // Dark metallic gradient background
        const grad = y / size;
        let r = Math.round(10 + grad * 12);
        let g = Math.round(18 + grad * 18);
        let b = Math.round(36 + grad * 32);
        let a = 255;

        // Anti-aliasing on boundary
        if (distSquircle > 0.85) {
          a = Math.round(255 * (1 - (distSquircle - 0.85) / 0.15));
        }

        // Bookmark Ribbon Geometry
        const bx = x / size;
        const by = y / size;

        // Bookmark shape bounds: x in [0.28, 0.72], y in [0.20, 0.80]
        if (bx >= 0.28 && bx <= 0.72 && by >= 0.20 && by <= 0.80) {
          // Bottom chevron notch: if y > 0.64 and |bx - 0.5| < (by - 0.64) * 1.5 -> cut out
          const inNotch = by > 0.65 && Math.abs(bx - 0.5) < (by - 0.65) * 1.3;

          if (!inNotch) {
            // Left facet vs Right facet for 3D crystal lighting
            if (bx < 0.5) {
              // Bright cyan / teal highlight
              r = Math.round(40 + (1 - by) * 40);
              g = Math.round(180 + (1 - by) * 40);
              b = Math.round(245 + (1 - by) * 10);
            } else {
              // Deep sapphire / indigo shadow facet
              r = Math.round(20 + by * 30);
              g = Math.round(110 + by * 40);
              b = Math.round(210 + by * 35);
            }

            // Central crystal spine glow
            const spineDist = Math.abs(bx - 0.5);
            if (spineDist < 0.05) {
              const glow = (1 - spineDist / 0.05) * 0.4;
              r = Math.min(255, Math.round(r + glow * 180));
              g = Math.min(255, Math.round(g + glow * 220));
              b = Math.min(255, Math.round(b + glow * 255));
            }
          }
        }

        // Subtle outer glowing border
        if (distSquircle > 0.75 && distSquircle <= 0.88) {
          r = Math.min(255, r + 40);
          g = Math.min(255, g + 80);
          b = Math.min(255, b + 120);
        }

        buf[idx] = r;
        buf[idx + 1] = g;
        buf[idx + 2] = b;
        buf[idx + 3] = a;
      } else {
        // Transparent
        buf[idx] = 0;
        buf[idx + 1] = 0;
        buf[idx + 2] = 0;
        buf[idx + 3] = 0;
      }
    }
  }

  return createPng(size, size, buf);
}

// Generate icons in apps/extension/public and apps/extension/dist
const sizes = [16, 32, 48, 128];
const dirs = [
  path.resolve(process.cwd(), 'apps/extension/public'),
  path.resolve(process.cwd(), 'apps/extension/dist'),
];

for (const dir of dirs) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  for (const size of sizes) {
    const png = drawTesseraIcon(size);
    const filename = path.join(dir, `icon-${size}.png`);
    fs.writeFileSync(filename, png);
    console.log(`Generated ${filename}`);
  }
}

console.log('Done generating all Tessera extension icons.');
