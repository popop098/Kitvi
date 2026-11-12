import { writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
const root = resolve(import.meta.dirname, '../examples');
function crc32(data) { let crc = 0xffffffff; for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const name = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4); length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data]))); return Buffer.concat([length, name, data, crc]); }
function pattern(dotted) {
  const width = 96, height = 96, rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = y * (width * 4 + 1) + 1 + x * 4;
    const marked = dotted ? x % 24 < 2 && y % 24 < 2 : x % 48 === 0 || y % 48 === 0;
    rows[offset] = dotted ? 119 : 155; rows[offset + 1] = dotted ? 166 : 128; rows[offset + 2] = dotted ? 199 : 96; rows[offset + 3] = marked ? 100 : 0;
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
function tone() {
  const rate = 22050, seconds = 8, count = rate * seconds, data = Buffer.alloc(count * 2);
  const chord = [220, 261.6256, 329.6276];
  for (let index = 0; index < count; index++) {
    const t = index / rate, fade = Math.min(1, t / 0.4, (seconds - t) / 0.4);
    const sample = chord.reduce((sum, frequency) => sum + Math.sin(2 * Math.PI * frequency * t), 0) / chord.length;
    data.writeInt16LE(Math.round(sample * fade * 0.12 * 32767), index * 2);
  }
  const head = Buffer.alloc(44); head.write('RIFF'); head.writeUInt32LE(36 + data.length, 4); head.write('WAVEfmt ', 8); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22); head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}
await mkdir(join(root, 'cozy-desk/assets'), { recursive: true }); await mkdir(join(root, 'midnight-grid/assets'), { recursive: true });
await writeFile(join(root, 'cozy-desk/assets/paper.png'), pattern(false));
await writeFile(join(root, 'midnight-grid/assets/grid.png'), pattern(true));
await writeFile(join(root, 'cozy-desk/assets/soft-loop.wav'), tone());
console.log('Generated reproducible PNG patterns and an original 8-second synthesis test loop.');
