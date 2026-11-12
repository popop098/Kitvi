import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { colors, definition, themeManifest } from './theme-test-helpers.mjs';

// Synthetic installable inputs shared by unit tests and the actual-host harness.
// These are generated in temporary profiles; no distributable theme is bundled.
export const themePackageFixtures = [
  { key: 'local-audio', id: 'kitvi.fixture.local-audio', name: 'Local audio fixture', columns: 2, canvas: '#e8edf2' },
  { key: 'youtube-video', id: 'kitvi.fixture.youtube-video', name: 'YouTube video fixture', columns: 3, canvas: '#d8e4ef' },
];

function crc32(data) { let crc = 0xffffffff; for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
function pngChunk(type, data) {
  const name = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
function png() {
  const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(Buffer.from([0, 80, 120, 160, 255]))), pngChunk('IEND', Buffer.alloc(0))]);
}
function wav() {
  const rate = 8000, samples = rate * 8, data = Buffer.alloc(samples * 2);
  for (let sample = 0; sample < samples; sample++) data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * sample / rate) * 1600), sample * 2);
  const header = Buffer.alloc(44); header.write('RIFF'); header.writeUInt32LE(36 + data.length, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

export async function writeThemePackageFixture(directory, fixture = themePackageFixtures[0]) {
  const audioAsset = 'assets/test-tone.wav', imageAsset = 'assets/test-pixel.png';
  const local = fixture.key === 'local-audio';
  const manifest = themeManifest({ id: fixture.id, name: fixture.name, permissions: ['theme', 'playback'] });
  const theme = definition({
    id: fixture.id, name: fixture.name,
    modes: { light: { ...colors(), canvas: fixture.canvas }, dark: { ...colors(), canvas: fixture.canvas } },
    background: { asset: imageAsset, opacity: 0.15, fit: 'cover' },
    layout: { order: local ? ['summary', 'performance', 'bgm', 'storage', 'displays', 'devices'] : ['bgm', 'summary', 'performance', 'storage', 'displays', 'devices'], hidden: [], columns: fixture.columns },
    bgm: { title: 'Playback fixture', tracks: [{ id: 'test-track', title: 'Playback test', source: local ? { type: 'asset', path: audioAsset } : { type: 'youtube', videoId: 'M7lc1UVf-VE' } }], loop: local, volume: 20 },
  });
  await mkdir(join(directory, 'assets'), { recursive: true });
  await writeFile(join(directory, 'kitvi-plugin.json'), JSON.stringify(manifest));
  await writeFile(join(directory, 'theme.json'), JSON.stringify(theme));
  await writeFile(join(directory, imageAsset), png());
  if (local) await writeFile(join(directory, audioAsset), wav());
  return { ...fixture, source: directory, audioAsset, imageAsset };
}
