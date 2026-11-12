import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { validatePluginManifest, validateArchivePath } from '../shared/plugin-schema.ts';
import { PluginManager } from '../electron/plugins.ts';

const manifest = (overrides = {}) => ({ apiVersion: 1, id: 'kitvi.test-plugin', name: 'Test plugin', version: '1.0.0', minKitviVersion: '0.4.0', description: 'A static plugin.', author: 'Kitvi', entry: 'ui/index.html', permissions: ['storage'], ...overrides });
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(files) {
  const local = [], central = []; let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name), data = Buffer.from(file.data ?? ''), compressed = file.deflate ? deflateRawSync(data) : data;
    const crc = crc32(data), method = file.deflate ? 8 : 0;
    const head = Buffer.alloc(30); head.writeUInt32LE(0x04034b50); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x800, 6); head.writeUInt16LE(method, 8); head.writeUInt32LE(crc, 14); head.writeUInt32LE(compressed.length, 18); head.writeUInt32LE(file.size ?? data.length, 22); head.writeUInt16LE(name.length, 26);
    local.push(head, name, compressed);
    const dir = Buffer.alloc(46); dir.writeUInt32LE(0x02014b50); dir.writeUInt16LE(0x314, 4); dir.writeUInt16LE(20, 6); dir.writeUInt16LE(0x800, 8); dir.writeUInt16LE(method, 10); dir.writeUInt32LE(crc, 16); dir.writeUInt32LE(compressed.length, 20); dir.writeUInt32LE(file.size ?? data.length, 24); dir.writeUInt16LE(name.length, 28); dir.writeUInt32LE(((file.mode ?? 0o100644) << 16) >>> 0, 38); dir.writeUInt32LE(offset, 42);
    central.push(dir, name); offset += head.length + name.length + compressed.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}
const packageFiles = (value = manifest(), extra = []) => [{ name: 'kitvi-plugin.json', data: JSON.stringify(value) }, { name: 'ui/index.html', data: '<!doctype html><p>Plugin</p>' }, ...extra];
async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'kitvi-plugin-test-'));
  const manager = new PluginManager({ directory, appVersion: '0.4.0', log: () => {}, ...options });
  t.after(async () => { await manager.dispose(); await rm(directory, { recursive: true, force: true }); });
  let counter = 0;
  return { directory, manager, package: async (files = packageFiles()) => { const file = path.join(directory, `test-${counter++}.kitvi-plugin.zip`); await writeFile(file, zip(files)); return file; } };
}
async function activate(manager) {
  await manager.setSystemEnabled(true, true);
  const installed = manager.get('kitvi.test-plugin'); await manager.acceptActivation(installed.id, installed.contentHash);
}

test('manifest rejects unsupported API, permissions, versions, IDs and unsafe entries', () => {
  assert.equal(validatePluginManifest(manifest(), '0.4.0').id, 'kitvi.test-plugin');
  for (const override of [{ apiVersion: 2 }, { permissions: ['shell'] }, { permissions: ['storage', 'storage'] }, { version: 'latest' }, { version: 'v1.0.0' }, { minKitviVersion: '0.5.0' }, { id: '../escape' }, { id: 'Kitvi.Test' }, { id: 'con.example' }, { entry: '../index.html' }, { entry: 'ui/index.js' }, { backend: 'index.js' }]) assert.throws(() => validatePluginManifest(manifest(override), '0.4.0'));
});

test('archive paths reject Windows aliases, traversal, absolute paths and alternate streams', () => {
  for (const file of ['../escape.js', '/root.js', 'C:/root.js', 'ui\\escape.js', 'ui/x.js:payload', 'ui/NUL.txt', 'ui/con.html', 'ui/file. ', 'ui/../escape.js', './index.html', 'ui//x.js', 'ui/COM1.js']) assert.throws(() => validateArchivePath(file), file);
  assert.equal(validateArchivePath('ui/index.html'), 'ui/index.html');
});

test('preview never installs; confirmation persists and identical packages are idempotent', async (t) => {
  const f = await fixture(t), file = await f.package();
  const preview = await f.manager.previewFile(file);
  assert.equal(preview.manifest.id, 'kitvi.test-plugin'); assert.deepEqual(f.manager.state.plugins, []);
  const confirmed = await f.manager.confirm(preview.token); assert.equal(confirmed.busy, false); assert.equal(f.manager.state.plugins.length, 1);
  const installed = f.manager.get('kitvi.test-plugin'); assert.equal(installed.enabled, false); assert.equal(installed.needsConsent, true);
  const previewAgain = await f.manager.previewFile(file); await f.manager.confirm(previewAgain.token);
  assert.equal(f.manager.state.plugins.length, 1); assert.equal(f.manager.get(installed.id).installedAt, installed.installedAt);
  await activate(f.manager);
  const page = await f.manager.readResource(installed.id, 'ui/index.html'); assert.match(page.data.toString(), /Plugin/); assert.match(page.mime, /^text\/html/);
  // The 0.6 registry did not yet bind receipts to an explicit SDK contract.
  const registryPath = path.join(f.directory, 'plugins', 'registry.json'), registry = JSON.parse(await readFile(registryPath, 'utf8'));
  delete registry.consents[installed.id].apiVersion; delete registry.consents[installed.id].kind; await writeFile(registryPath, JSON.stringify(registry));
  const restored = new PluginManager({ directory: f.directory, appVersion: '0.4.0', log: () => {} });
  assert.equal(restored.get(installed.id).contentHash, installed.contentHash); assert.equal(restored.canRun(installed.id), true); await restored.dispose();
});

test('changed same-version packages and downgrades cannot replace an installed plugin', async (t) => {
  const f = await fixture(t); await f.manager.confirm((await f.manager.previewFile(await f.package())).token);
  await activate(f.manager);
  const changed = packageFiles(); changed[1].data = '<p>Changed</p>';
  await assert.rejects(f.manager.previewFile(await f.package(changed)), /version|버전/i);
  await assert.rejects(f.manager.previewFile(await f.package(packageFiles(manifest({ version: '0.9.0' })))), /version|버전/i);
  assert.equal((await f.manager.readResource('kitvi.test-plugin', 'ui/index.html')).data.toString(), '<!doctype html><p>Plugin</p>');
});

test('archive inspection rejects traversal, links, case collisions, executables and expansion bombs', async (t) => {
  const f = await fixture(t);
  const attacks = [
    [{ name: '../escape.js', data: 'x' }], [{ name: 'ui/link.js', data: 'target', mode: 0o120777 }],
    [{ name: 'UI/INDEX.HTML', data: 'x' }], [{ name: 'ui/helper.exe', data: 'MZ' }],
    [{ name: 'ui/large.js', data: Buffer.alloc(4 * 1024 * 1024 + 1, 65), deflate: true }],
    [{ name: 'ui/font.woff2', data: Buffer.alloc(2 * 1024 * 1024 + 1, 65), deflate: true }],
  ];
  for (const extra of attacks) await assert.rejects(f.manager.previewFile(await f.package(packageFiles(manifest(), extra))));
  await assert.rejects(f.manager.previewFile(await f.package(packageFiles(manifest(), Array.from({ length: 257 }, (_, i) => ({ name: `ui/${i}.js`, data: 'x' }))))));
  assert.deepEqual(f.manager.state.plugins, []);
});

test('plugin storage is bounded, isolated and inaccessible while disabled', async (t) => {
  const f = await fixture(t); await f.manager.confirm((await f.manager.previewFile(await f.package())).token);
  await activate(f.manager);
  await f.manager.pluginStorageSet('kitvi.test-plugin', 'theme', { dark: true });
  assert.deepEqual(await f.manager.pluginStorageGet('kitvi.test-plugin', 'theme'), { dark: true });
  assert.equal(await f.manager.pluginStorageGet('kitvi.test-plugin', 'missing'), null);
  await assert.rejects(f.manager.pluginStorageSet('kitvi.test-plugin', '__proto__', 'x'));
  await assert.rejects(f.manager.pluginStorageSet('kitvi.test-plugin', 'large', 'x'.repeat(65536)));
  await f.manager.setEnabled('kitvi.test-plugin', false);
  await assert.rejects(f.manager.readResource('kitvi.test-plugin', 'ui/index.html'));
  await assert.rejects(f.manager.pluginStorageGet('kitvi.test-plugin', 'theme'));
  await f.manager.remove('kitvi.test-plugin'); assert.deepEqual(f.manager.state.plugins, []);
});

test('corrupt registry is reported without overwriting or trusting its paths', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'kitvi-plugin-registry-')); t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, 'plugins')); const file = path.join(directory, 'plugins', 'registry.json'); await writeFile(file, '{bad');
  const manager = new PluginManager({ directory, appVersion: '0.4.0', log: () => {} }); t.after(() => manager.dispose());
  assert.equal(manager.state.plugins.length, 0); assert.match(manager.state.message, /registry|목록/i); assert.equal(await readFile(file, 'utf8'), '{bad');
  await assert.rejects(manager.setEnabled('kitvi.test-plugin', true));
});

test('resource access rejects traversal and linked installed files', async (t) => {
  const f = await fixture(t); await f.manager.confirm((await f.manager.previewFile(await f.package())).token);
  await activate(f.manager);
  await assert.rejects(f.manager.readResource('kitvi.test-plugin', '../registry.json'));
  const outside = path.join(f.directory, 'outside'); await mkdir(outside); await writeFile(path.join(outside, 'secret.txt'), 'secret');
  const link = path.join(f.directory, 'plugins', 'resources', 'kitvi.test-plugin', 'ui', 'linked');
  try { await symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code === 'EPERM' || error.code === 'EACCES') { t.skip('The current Windows sandbox cannot create junctions.'); return; } throw error; }
  await assert.rejects(f.manager.readResource('kitvi.test-plugin', 'ui/linked/secret.txt'), /link|junction/i);
  await assert.rejects(f.manager.remove('kitvi.test-plugin'), /link|junction/i);
  assert.equal(f.manager.get('kitvi.test-plugin').enabled, true);
  assert.equal(await readFile(path.join(outside, 'secret.txt'), 'utf8'), 'secret');
});

test('confirmation rejects files changed after the permission preview', async (t) => {
  const f = await fixture(t), preview = await f.manager.previewFile(await f.package());
  await writeFile(path.join(f.directory, 'plugins', 'staging', preview.token, 'ui', 'index.html'), '<script>changed()</script>');
  await assert.rejects(f.manager.confirm(preview.token), /changed|integrity/i); assert.deepEqual(f.manager.state.plugins, []);
});

test('installed resource hashes reject modification both during a session and on restart', async (t) => {
  const f = await fixture(t); await f.manager.confirm((await f.manager.previewFile(await f.package())).token);
  await activate(f.manager);
  const entry = path.join(f.directory, 'plugins', 'resources', 'kitvi.test-plugin', 'ui', 'index.html'); await writeFile(entry, '<script>tampered()</script>');
  await assert.rejects(f.manager.readResource('kitvi.test-plugin', 'ui/index.html'), /integrity|changed/i);
  const restarted = new PluginManager({ directory: f.directory, appVersion: '0.4.0', log: () => {} }); t.after(() => restarted.dispose());
  assert.equal(restarted.state.plugins.length, 0); assert.match(restarted.state.message, /integrity|changed/i);
});

test('repository input rejects arbitrary URLs before making a network request', async (t) => {
  const f = await fixture(t);
  for (const repo of ['https://evil.example/a/b', 'https://github.com/a/b?token=secret', 'a/b/releases/latest', 'https://user:password@github.com/a/b', 'a/..']) await assert.rejects(f.manager.previewRepository(repo), /GitHub|repository/i);
});

test('GitHub packages require same-repository assets and matching SHA256SUMS', async (t) => {
  const f = await fixture(t), originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const data = zip(packageFiles());
  const asset = { name: 'test.kitvi-plugin.zip', size: data.length, browser_download_url: 'https://github.com/example/plugin/releases/download/v1.0.0/test.kitvi-plugin.zip' };
  const sums = { name: 'SHA256SUMS.txt', size: 100, browser_download_url: 'https://github.com/example/plugin/releases/download/v1.0.0/SHA256SUMS.txt' };
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value === 'https://api.github.com/repos/example/plugin/releases/latest') return new Response(JSON.stringify({ draft: false, assets: [{ ...asset, browser_download_url: 'https://github.com/attacker/plugin/releases/download/v1.0.0/test.kitvi-plugin.zip' }, sums] }));
    throw new Error('Unsafe URL was fetched');
  };
  await assert.rejects(f.manager.previewRepository('example/plugin'), /selected GitHub repository/i);
  globalThis.fetch = async (url) => {
    if (String(url).includes('api.github.com/')) return new Response(JSON.stringify({ draft: false, assets: [asset, sums] }));
    if (String(url).endsWith('SHA256SUMS.txt')) return new Response(`${'0'.repeat(64)}  test.kitvi-plugin.zip\n`);
    return new Response(data);
  };
  await assert.rejects(f.manager.previewRepository('example/plugin'), /checksum/i);
});

test('verified GitHub packages install, update from the same source and reject source takeover', async (t) => {
  const f = await fixture(t), originalFetch = globalThis.fetch; t.after(() => { globalThis.fetch = originalFetch; });
  let data = zip(packageFiles()), repo = 'example/plugin';
  globalThis.fetch = async (url) => {
    const value = String(url), base = `https://github.com/${repo}/releases/download/v1.0.0/`;
    if (value === `https://api.github.com/repos/${repo}/releases/latest`) return new Response(JSON.stringify({ draft: false, assets: [{ name: 'test.kitvi-plugin.zip', size: data.length, browser_download_url: `${base}test.kitvi-plugin.zip` }, { name: 'SHA256SUMS.txt', size: 100, browser_download_url: `${base}SHA256SUMS.txt` }] }));
    if (value === `${base}SHA256SUMS.txt`) return new Response(`${createHash('sha256').update(data).digest('hex')}  test.kitvi-plugin.zip\n`);
    if (value === `${base}test.kitvi-plugin.zip`) return new Response(data);
    throw new Error(`Unexpected URL: ${value}`);
  };
  const preview = await f.manager.previewRepository('https://github.com/Example/Plugin'); assert.equal(preview.source, 'github:example/plugin');
  await f.manager.confirm(preview.token); data = zip(packageFiles(manifest({ version: '1.1.0' })));
  await f.manager.confirm((await f.manager.previewRepository('example/plugin')).token); assert.equal(f.manager.get('kitvi.test-plugin').version, '1.1.0');
  repo = 'other/plugin'; data = zip(packageFiles(manifest({ version: '2.0.0' })));
  await assert.rejects(f.manager.previewRepository(repo), /another source/i);
  await assert.rejects(f.manager.previewFile(await f.package(packageFiles(manifest({ version: '2.0.0' })))), /another source/i);
});

test('release downloads reject redirects to arbitrary HTTPS hosts', async (t) => {
  const f = await fixture(t), originalFetch = globalThis.fetch; t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url) => {
    if (String(url).startsWith('https://api.github.com/')) return new Response(JSON.stringify({ draft: false, assets: [{ name: 'test.kitvi-plugin.zip', size: 100, browser_download_url: 'https://github.com/example/plugin/releases/download/v1.0.0/test.kitvi-plugin.zip' }, { name: 'SHA256SUMS.txt', size: 100, browser_download_url: 'https://github.com/example/plugin/releases/download/v1.0.0/SHA256SUMS.txt' }] }));
    return new Response('', { status: 302, headers: { location: 'https://evil.example/SHA256SUMS.txt' } });
  };
  await assert.rejects(f.manager.previewRepository('example/plugin'), /Untrusted.*redirect/i);
});

test('archive CRC mismatches fail before any installation', async (t) => {
  const f = await fixture(t), file = await f.package(); const data = await readFile(file);
  const start = data.indexOf(Buffer.from('<!doctype html>')); data[start] = 63; await writeFile(file, data);
  await assert.rejects(f.manager.previewFile(file), /checksum/i); assert.equal(f.manager.state.plugins.length, 0);
});

test('updates preserve disabled state and existing plugin storage', async (t) => {
  const f = await fixture(t);
  await f.manager.confirm((await f.manager.previewFile(await f.package())).token);
  await activate(f.manager);
  await f.manager.pluginStorageSet('kitvi.test-plugin', 'saved', { value: 17 });
  await f.manager.setEnabled('kitvi.test-plugin', false);
  await f.manager.confirm((await f.manager.previewFile(await f.package(packageFiles(manifest({ version: '1.1.0' }))))).token);
  assert.equal(f.manager.get('kitvi.test-plugin').enabled, false);
  assert.equal(f.manager.get('kitvi.test-plugin').needsConsent, true);
  await f.manager.acceptActivation('kitvi.test-plugin', f.manager.get('kitvi.test-plugin').contentHash);
  await f.manager.setEnabled('kitvi.test-plugin', true);
  assert.deepEqual(await f.manager.pluginStorageGet('kitvi.test-plugin', 'saved'), { value: 17 });
});

test('commit guard runs after queued preparation and refuses installation without file changes', async (t) => {
  let blocked = false;
  const f = await fixture(t, { beforeCommit: () => { if (blocked) throw new Error('Active media job'); } });
  await f.manager.confirm((await f.manager.previewFile(await f.package())).token);
  await activate(f.manager);
  const before = f.manager.get('kitvi.test-plugin');
  const preview = await f.manager.previewFile(await f.package(packageFiles(manifest({ version: '1.1.0' }))));
  const preceding = f.manager.previewFile(await f.package(packageFiles(manifest({ id: 'kitvi.queue-blocker' }))));
  const confirmation = f.manager.confirm(preview.token);
  blocked = true;
  const refusal = assert.rejects(confirmation, /Active media/);
  await preceding; await refusal;
  assert.deepEqual(f.manager.get('kitvi.test-plugin'), before);
  assert.match((await f.manager.readResource('kitvi.test-plugin', 'ui/index.html')).data.toString(), /Plugin/);
  blocked = false;
  await f.manager.confirm(preview.token);
  assert.equal(f.manager.get('kitvi.test-plugin').version, '1.1.0');
});
