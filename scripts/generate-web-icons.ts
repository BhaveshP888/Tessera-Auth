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
 * Draws an ultra-clean, minimal, high-contrast monochrome Tessera favicon:
 * Deep obsidian squircle base with a razor-sharp geometric bookmark glyph and dynamic central cut.
 */
function drawMinimalIcon(size: number): Buffer {
  const buf = Buffer.alloc(size * size * 4);
  const center = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      const nx = (x - center) / (size * 0.44);
      const ny = (y - center) / (size * 0.44);
      const distSquircle = Math.pow(Math.abs(nx), 3.6) + Math.pow(Math.abs(ny), 3.6);

      if (distSquircle <= 1.0) {
        // Deep obsidian background
        let r = 9;
        let g = 9;
        let b = 11;
        let a = 255;

        // Anti-aliased outer boundary
        if (distSquircle > 0.88) {
          a = Math.round(255 * (1 - (distSquircle - 0.88) / 0.12));
        }

        // Bookmark ribbon coordinates [0..1]
        const u = x / size;
        const v = y / size;

        // Minimal Bookmark Ribbon Geometry
        // Bounds: u in [0.28, 0.72], v in [0.20, 0.80]
        if (u >= 0.28 && u <= 0.72 && v >= 0.20 && v <= 0.80) {
          // Bottom chevron notch: cutout when v > 0.65 and |u - 0.5| < (v - 0.65) * 1.3
          const inNotch = v > 0.64 && Math.abs(u - 0.5) < (v - 0.64) * 1.35;

          if (!inNotch) {
            // Check if inside inner minimal "T" cutout
            // Top bar of T: u in [0.38, 0.62], v in [0.34, 0.43]
            // Stem of T: u in [0.44, 0.56], v in [0.43, 0.60]
            const inTTop = u >= 0.37 && u <= 0.63 && v >= 0.33 && v <= 0.42;
            const inTStem = u >= 0.435 && u <= 0.565 && v >= 0.42 && v <= 0.58;

            if (inTTop || inTStem) {
              // Cutout inside ribbon revealing obsidian dark background
              r = 9;
              g = 9;
              b = 11;
            } else {
              // Crisp pure white ribbon body
              r = 255;
              g = 255;
              b = 255;
            }
          }
        }

        // Subtle crisp outer border
        if (distSquircle > 0.80 && distSquircle <= 0.90) {
          r = Math.min(255, r + 45);
          g = Math.min(255, g + 45);
          b = Math.min(255, b + 50);
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

// Generate SVG string
const svgIcon = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <!-- Background Obsidian Squircle -->
  <rect width="512" height="512" rx="128" fill="#09090b"/>
  <rect x="8" y="8" width="496" height="496" rx="120" stroke="rgba(255, 255, 255, 0.12)" stroke-width="8"/>
  
  <!-- Minimalist Geometric Bookmark Ribbon -->
  <path d="M144 112H368C376.837 112 384 119.163 384 128V396C384 406.848 371.328 412.753 362.836 406.012L256 321.2L149.164 406.012C140.672 412.753 128 406.848 128 396V128C128 119.163 135.163 112 144 112Z" fill="#FFFFFF"/>
  
  <!-- Inner Geometric "T" Cutout -->
  <path d="M192 176H320V220H276V300H236V220H192V176Z" fill="#09090b"/>
</svg>
`;

const publicDir = path.resolve(process.cwd(), 'apps/web/public');
const distDir = path.resolve(process.cwd(), 'apps/web/dist');

for (const dir of [publicDir, distDir]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // 1. Write SVG
  fs.writeFileSync(path.join(dir, 'favicon.svg'), svgIcon, 'utf-8');
  console.log(`Created ${path.join(dir, 'favicon.svg')}`);

  // 2. Write PNGs
  const sizes = [
    { name: 'favicon.png', size: 64 },
    { name: 'icon.png', size: 192 },
    { name: 'apple-touch-icon.png', size: 180 },
    { name: 'icon-192.png', size: 192 },
    { name: 'icon-512.png', size: 512 },
  ];

  for (const item of sizes) {
    const pngBuf = drawMinimalIcon(item.size);
    fs.writeFileSync(path.join(dir, item.name), pngBuf);
    console.log(`Created ${path.join(dir, item.name)} (${item.size}x${item.size})`);
  }
}

console.log('Successfully generated all website icons.');
