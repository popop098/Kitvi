import { deflateRawSync } from 'node:zlib';
export const colors = () => Object.fromEntries(['canvas', 'panel', 'surface', 'text', 'muted', 'border', 'accent', 'accentText', 'accentSoft', 'cpu', 'memory', 'gpu'].map((key) => [key, '#123456']));
export const definition = (overrides = {}) => ({ schemaVersion: 1, id: 'kitvi.test-theme', name: 'Test theme', modes: { light: colors(), dark: colors() }, ...overrides });
export const themeManifest = (overrides = {}) => ({ apiVersion: 2, kind: 'theme', theme: 'theme.json', id: 'kitvi.test-theme', name: 'Test theme', version: '1.0.0', minKitviVersion: '0.7.0', description: 'A declarative theme.', author: 'Kitvi', permissions: ['theme'], ...overrides });
function crc32(data) { let crc = 0xffffffff; for (const byte of data) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
export function zip(files) {
  const local = [], central = []; let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name), data = Buffer.from(file.data ?? ''), compressed = deflateRawSync(data), crc = crc32(data);
    const head = Buffer.alloc(30); head.writeUInt32LE(0x04034b50); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x800, 6); head.writeUInt16LE(8, 8); head.writeUInt32LE(crc, 14); head.writeUInt32LE(compressed.length, 18); head.writeUInt32LE(data.length, 22); head.writeUInt16LE(name.length, 26); local.push(head, name, compressed);
    const dir = Buffer.alloc(46); dir.writeUInt32LE(0x02014b50); dir.writeUInt16LE(0x314, 4); dir.writeUInt16LE(20, 6); dir.writeUInt16LE(0x800, 8); dir.writeUInt16LE(8, 10); dir.writeUInt32LE(crc, 16); dir.writeUInt32LE(compressed.length, 20); dir.writeUInt32LE(data.length, 24); dir.writeUInt16LE(name.length, 28); dir.writeUInt32LE((0o100644 << 16) >>> 0, 38); dir.writeUInt32LE(offset, 42); central.push(dir, name); offset += head.length + name.length + compressed.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16); return Buffer.concat([...local, cd, end]);
}
export const themeFiles = (manifest = themeManifest(), theme = definition(), extra = []) => [{ name: 'kitvi-plugin.json', data: JSON.stringify(manifest) }, { name: manifest.theme, data: JSON.stringify(theme) }, ...extra];
