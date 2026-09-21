import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const sizes = [16, 32, 48, 128];
const outputDirectory = new URL("../icons/", import.meta.url);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function insideRoundedRect(x, y, size, inset, radius) {
  const left = inset;
  const right = size - inset - 1;
  const top = inset;
  const bottom = size - inset - 1;
  const clampedX = Math.max(left + radius, Math.min(x, right - radius));
  const clampedY = Math.max(top + radius, Math.min(y, bottom - radius));
  return (x - clampedX) ** 2 + (y - clampedY) ** 2 <= radius ** 2;
}

function paintIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const outerInset = Math.max(1, Math.round(size * 0.035));
  const border = Math.max(1, Math.round(size * 0.055));
  const radius = Math.max(2, Math.round(size * 0.22));
  const amber = [255, 176, 0, 255];
  const dark = [24, 24, 24, 255];
  const transparent = [0, 0, 0, 0];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const outer = insideRoundedRect(x, y, size, outerInset, radius);
      const inner = insideRoundedRect(
        x,
        y,
        size,
        outerInset + border,
        Math.max(1, radius - border)
      );
      const color = !outer ? transparent : inner ? dark : amber;
      const offset = (y * size + x) * 4;
      pixels.set(color, offset);
    }
  }

  const line = Math.max(1, Math.round(size * 0.075));
  const x1 = Math.round(size * 0.27);
  const x2 = Math.round(size * 0.73);
  const y1 = Math.round(size * 0.31);
  const y2 = Math.round(size * 0.5);
  const y3 = Math.round(size * 0.69);

  function fillRect(left, top, right, bottom, color) {
    for (let y = Math.max(0, top); y <= Math.min(size - 1, bottom); y += 1) {
      for (let x = Math.max(0, left); x <= Math.min(size - 1, right); x += 1) {
        pixels.set(color, (y * size + x) * 4);
      }
    }
  }

  fillRect(x1, y1, x2, y1 + line, amber);
  fillRect(x1, y1, x1 + line, y2, amber);
  fillRect(x1, y2, x2, y2 + line, amber);
  fillRect(x2 - line, y2, x2, y3, amber);
  fillRect(x1, y3, x2, y3 + line, amber);
  return pixels;
}

function encodePng(size, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;

  const scanlines = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * (size * 4 + 1);
    scanlines[rowOffset] = 0;
    pixels.copy(scanlines, rowOffset + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    signature,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(scanlines, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

mkdirSync(outputDirectory, { recursive: true });
for (const size of sizes) {
  const pixels = paintIcon(size);
  writeFileSync(join(outputDirectory.pathname, `icon-${size}.png`), encodePng(size, pixels));
}
