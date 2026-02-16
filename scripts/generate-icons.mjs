import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { deflateSync } from 'zlib';

const iconDir = join(process.cwd(), 'icons');
if (!existsSync(iconDir)) {
  mkdirSync(iconDir, { recursive: true });
}

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c >>> 0;
}

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);

  const crcBuffer = Buffer.alloc(4);
  const combined = Buffer.concat([typeBuffer, data]);
  crcBuffer.writeUInt32BE(crc32(combined), 0);

  return Buffer.concat([lengthBuffer, combined, crcBuffer]);
}

function makeIcon(size) {
  const rowLength = size * 4;
  const raw = Buffer.alloc((rowLength + 1) * size);

  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (rowLength + 1);
    raw[rowStart] = 0; // no filter

    for (let x = 0; x < size; x += 1) {
      const pixelOffset = rowStart + 1 + x * 4;
      const inset = x >= size * 0.2 && x < size * 0.8 && y >= size * 0.2 && y < size * 0.8;
      const diagonal = Math.abs(x - y) <= Math.max(1, Math.floor(size * 0.06));
      const antiDiagonal = Math.abs(x + y - (size - 1)) <= Math.max(1, Math.floor(size * 0.06));

      if (inset) {
        raw[pixelOffset] = 26; // R
        raw[pixelOffset + 1] = 115; // G
        raw[pixelOffset + 2] = 232; // B
        raw[pixelOffset + 3] = 255; // A
      } else if (diagonal || antiDiagonal) {
        raw[pixelOffset] = 58;
        raw[pixelOffset + 1] = 141;
        raw[pixelOffset + 2] = 255;
        raw[pixelOffset + 3] = 255;
      } else {
        raw[pixelOffset] = 245;
        raw[pixelOffset + 1] = 248;
        raw[pixelOffset + 2] = 255;
        raw[pixelOffset + 3] = 255;
      }
    }
  }

  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type (RGBA)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const compressed = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    pngSignature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const sizes = [16, 32, 48, 128];

for (const size of sizes) {
  const target = join(iconDir, `icon${size}.png`);
  writeFileSync(target, makeIcon(size));
}

console.log(`Generated ${sizes.length} icons in ${iconDir}`);
