import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const W = 512;
const H = 512;
const raw = Buffer.alloc((W * 4 + 1) * H);

function set(x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = y * (W * 4 + 1) + 1 + x * 4;
  raw[i] = r;
  raw[i + 1] = g;
  raw[i + 2] = b;
  raw[i + 3] = 255;
}

function fill(x0, y0, x1, y1, color) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) set(x, y, color[0], color[1], color[2]);
}

function round(x0, y0, x1, y1, radius, color) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dx = x < x0 + radius ? x0 + radius - x : x > x1 - radius ? x - (x1 - radius) : 0;
      const dy = y < y0 + radius ? y0 + radius - y : y > y1 - radius ? y - (y1 - radius) : 0;
      if (dx * dx + dy * dy <= radius * radius) set(x, y, color[0], color[1], color[2]);
    }
  }
}

const navy = [11, 42, 74];
const cream = [245, 239, 224];
const teal = [15, 138, 110];
const ink = [28, 42, 56];
fill(0, 0, W, H, navy);
round(86, 56, 426, 456, 28, cream);
fill(86, 56, 426, 148, teal);
for (let i = 0; i < 12; i++) {
  const x = 120 + i * 22;
  const w = i % 3 === 0 ? 10 : 6;
  fill(x, 300, x + w, 390, ink);
}
fill(120, 200, 300, 224, teal);
fill(120, 244, 250, 260, [180, 170, 150]);

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]);
const out = "docs/muse-connector/icons/ship-label.png";
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
