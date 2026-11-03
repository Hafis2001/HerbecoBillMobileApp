/**
 * Generates a simple placeholder HERBECO logo (assets/logo.png, 1024x1024
 * RGB PNG) with the brand palette so the app runs before the real logo is added.
 * Safe to delete after use.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const W = 1024;
const H = 1024;

const toRGB = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const BG = toRGB('#1F6F43');   // deep herbal green
const LIGHT = toRGB('#A8D5A2'); // fresh light green
const GOLD = toRGB('#C9A227'); // soft gold

/** Signed 32-bit CRC32 for PNG chunks. */
function crc32(buf) {
  let c;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function build() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type RGB (no alpha)

  // Raw pixel rows with filter byte 0.
  const stride = W * 3;
  const raw = Buffer.alloc((stride + 1) * H);
  for (let y = 0; y < H; y++) {
    const row = y * (stride + 1);
    raw[row] = 0;
    for (let x = 0; x < W; x++) {
      const idx = row + 1 + x * 3;
      const cx = x - W / 2;
      const cy = y - H / 2;
      const r = Math.sqrt(cx * cx + cy * cy);

      let px;
      if (r > 400) {
        px = BG; // outside circle
      } else if (r > 330) {
        px = LIGHT; // light green ring
      } else {
        // Leaf-ish shape: darker green ellipse tilted + gold vein stem
        const lx = cx / 240;
        const ly = cy / 300;
        if (lx * lx + ly * ly < 1) px = toRGB('#155231');
        else if (Math.abs(cx / 90 - cy / 300 * 0) < 20 && r < 240) px = GOLD; // vein band
        else px = LIGHT;
      }
      raw[idx] = px[0];
      raw[idx + 1] = px[1];
      raw[idx + 2] = px[2];
    }
  }

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  const out = path.resolve(__dirname, '..', 'assets', 'logo.png');
  fs.writeFileSync(out, png);
  console.log('Wrote', out, png.length, 'bytes');
}

build();
