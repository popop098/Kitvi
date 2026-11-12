import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PluginManager } from '../electron/plugins.ts';
import { validatePluginManifest } from '../shared/plugin-schema.ts';

const id = 'kitvi.test-plugin';
const manifest = (extra = {}) => ({ apiVersion: 1, id, name: 'Test plugin', version: '1.0.0', minKitviVersion: '0.6.0', description: 'A static plugin.', author: 'Kitvi', entry: 'ui/index.html', permissions: ['storage'], ...extra });
function zip(value) {
  const files = [['kitvi-plugin.json', JSON.stringify(value)], ['ui/index.html', `<!doctype html><p>${value.version}</p>`]];
  const local = [], central = []; let offset = 0;
  for (const [file, text] of files) {
    const name = Buffer.from(file), data = Buffer.from(text); let crc = 0xffffffff;
    for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    crc = (crc ^ 0xffffffff) >>> 0;
    const head = Buffer.alloc(30); head.writeUInt32LE(0x04034b50); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x800, 6); head.writeUInt32LE(crc, 14); head.writeUInt32LE(data.length, 18); head.writeUInt32LE(data.length, 22); head.writeUInt16LE(name.length, 26);
    local.push(head, name, data);
    const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0x800, 8); entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(data.length, 20); entry.writeUInt32LE(data.length, 24); entry.writeUInt16LE(name.length, 28); entry.writeUInt32LE(offset, 42);
    central.push(entry, name); offset += head.length + name.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'kitvi-plugin-consent-'));
  const managers = [], manager = new PluginManager({ directory, appVersion: '0.6.0', log: () => {}, ...options }); managers.push(manager);
  const registry = path.join(directory, 'plugins', 'registry.json');
  const originalFetch = globalThis.fetch; let release, counter = 0;
  globalThis.fetch = async (url) => {
    const target = String(url), base = `https://github.com/example/plugin/releases/download/v${release.value.version}/`;
    if (target === 'https://api.github.com/repos/example/plugin/releases/latest') return new Response(JSON.stringify({ draft: false, prerelease: false, tag_name: `v${release.value.version}`, assets: [{ name: 'test.kitvi-plugin.zip', size: release.data.length, browser_download_url: `${base}test.kitvi-plugin.zip` }, { name: 'SHA256SUMS.txt', size: 100, browser_download_url: `${base}SHA256SUMS.txt` }] }));
    if (target === `${base}SHA256SUMS.txt`) return new Response(`${createHash('sha256').update(release.data).digest('hex')}  test.kitvi-plugin.zip\n`);
    if (target === `${base}test.kitvi-plugin.zip`) return new Response(release.data);
    throw new Error(`Unexpected network URL: ${target}`);
  };
  const stage = async (value = manifest(), source = 'local') => {
    if (source === 'github') { release = { value, data: zip(value) }; return manager.previewRepository('example/plugin'); }
    const file = path.join(directory, `${counter++}.kitvi-plugin.zip`); await writeFile(file, zip(value)); return manager.previewFile(file);
  };
  t.after(async () => { for (const item of managers) await item.dispose(); globalThis.fetch = originalFetch; await rm(directory, { recursive: true, force: true }); });
  return { directory, manager, registry, stage, install: async (value = manifest(), source = 'local') => manager.confirm((await stage(value, source)).token), restart: () => { const item = new PluginManager({ directory, appVersion: '0.6.0', log: () => {} }); managers.push(item); return item; } };
}
async function activate(manager) { await manager.setSystemEnabled(true, true); return manager.acceptActivation(id, manager.get(id).contentHash); }

test('global plugin system defaults off and explicit notice acceptance persists across toggles and restarts', async (t) => {
  const f = await fixture(t);
  assert.deepEqual(f.manager.state.system, { enabled: false, acceptedAt: null });
  await assert.rejects(f.manager.setSystemEnabled(true), /accept|notice/i);
  await assert.rejects(f.manager.setSystemEnabled(true, 'true'), /accept|notice|invalid/i);
  await f.manager.setSystemEnabled(true, true); const acceptedAt = f.manager.state.system.acceptedAt;
  assert.ok(Number.isFinite(Date.parse(acceptedAt)));
  await f.manager.setSystemEnabled(false); assert.deepEqual(f.manager.state.system, { enabled: false, acceptedAt });
  const restarted = f.restart(); assert.deepEqual(restarted.state.system, { enabled: false, acceptedAt });
  await restarted.setSystemEnabled(true); assert.deepEqual(restarted.state.system, { enabled: true, acceptedAt });
});

test('installing never activates a plugin and both global and exact-package consent guard resources and storage', async (t) => {
  const f = await fixture(t); await f.install();
  assert.equal(f.manager.get(id).enabled, false); assert.equal(f.manager.get(id).needsConsent, true); assert.equal(f.manager.canRun(id), false);
  await f.manager.setSystemEnabled(true, true);
  await assert.rejects(f.manager.setEnabled(id, true), /consent|accept/i);
  await assert.rejects(f.manager.acceptActivation(id, '0'.repeat(64)), /changed|hash|again/i);
  await assert.rejects(f.manager.readResource(id, 'ui/index.html'));
  await assert.rejects(f.manager.pluginStorageSet(id, 'key', 1));
  await f.manager.acceptActivation(id, f.manager.get(id).contentHash);
  assert.equal(f.manager.canRun(id), true); assert.equal(f.manager.get(id).needsConsent, false);
  assert.match((await f.manager.readResource(id, 'ui/index.html')).data.toString(), /1\.0\.0/);
  await f.manager.pluginStorageSet(id, 'key', 17);
  await f.manager.setSystemEnabled(false);
  assert.equal(f.manager.canRun(id), false); assert.equal(f.manager.get(id).enabled, true); assert.equal(f.manager.get(id).needsConsent, false);
  assert.throws(() => f.manager.assertRunnable(id), /system|disabled/i);
  await assert.rejects(f.manager.readResource(id, 'ui/index.html'));
  await assert.rejects(f.manager.pluginStorageGet(id, 'key'));
  await assert.rejects(f.manager.pluginStorageSet(id, 'key', 99));
  await f.manager.setSystemEnabled(true);
  assert.equal(await f.manager.pluginStorageGet(id, 'key'), 17);
  const restarted = f.restart(); assert.equal(restarted.canRun(id), true); assert.equal(restarted.get(id).needsConsent, false);
  await restarted.setEnabled(id, false); assert.equal(restarted.canRun(id), false);
  await restarted.setEnabled(id, true); assert.equal(restarted.canRun(id), true);
});

test('legacy enabled records and serialized needsConsent cannot bypass either consent gate', async (t) => {
  const f = await fixture(t); await f.install(manifest({ minKitviVersion: '0.4.0' })); await activate(f.manager);
  const stored = JSON.parse(await readFile(f.registry, 'utf8')); delete stored.system; delete stored.consents; stored.plugins[0].enabled = true; stored.plugins[0].needsConsent = false;
  await writeFile(f.registry, JSON.stringify(stored));
  const restarted = f.restart(); assert.deepEqual(restarted.state.system, { enabled: false, acceptedAt: null });
  assert.equal(restarted.get(id).enabled, true); assert.equal(restarted.get(id).needsConsent, true); assert.equal(restarted.canRun(id), false);
  await restarted.setSystemEnabled(true, true);
  assert.equal(restarted.canRun(id), false); await assert.rejects(restarted.readResource(id, 'ui/index.html'));
  await assert.rejects(restarted.setEnabled(id, true), /consent|accept/i);
});

test('unchanged GitHub publisher and capabilities carry consent atomically to the new package', async (t) => {
  const f = await fixture(t); await f.install(manifest({ authorEmail: 'author@example.com', permissions: ['storage', 'media'] }), 'github'); await activate(f.manager);
  const oldHash = f.manager.get(id).contentHash;
  const beforeReceipt = JSON.parse(await readFile(f.registry, 'utf8')).consents[id]; assert.equal(beforeReceipt.version, '1.0.0');
  await f.install(manifest({ version: '1.1.0', authorEmail: 'author@example.com', permissions: ['media', 'storage'] }), 'github');
  assert.notEqual(f.manager.get(id).contentHash, oldHash); assert.equal(f.manager.get(id).needsConsent, false); assert.equal(f.manager.canRun(id), true);
  const nextReceipt = JSON.parse(await readFile(f.registry, 'utf8')).consents[id]; assert.equal(nextReceipt.version, '1.1.0'); assert.equal(nextReceipt.contentHash, f.manager.get(id).contentHash); assert.equal(nextReceipt.acceptedAt, beforeReceipt.acceptedAt);
  assert.equal(f.restart().canRun(id), true);
  await assert.rejects(f.manager.acceptActivation(id, oldHash), /changed|hash|again/i);
});

test('activation receipts without the exact installed version cannot authorize a plugin after restart', async (t) => {
  const f = await fixture(t); await f.install(); await activate(f.manager);
  const stored = JSON.parse(await readFile(f.registry, 'utf8'));
  for (const version of [undefined, '9.0.0']) {
    const changed = structuredClone(stored); if (version === undefined) delete changed.consents[id].version; else changed.consents[id].version = version;
    await writeFile(f.registry, JSON.stringify(changed)); const restarted = f.restart();
    assert.equal(restarted.get(id).needsConsent, true); assert.equal(restarted.canRun(id), false);
  }
});

test('publisher, contact and any capability changes require new activation consent', async (t) => {
  const f = await fixture(t); let version = 0;
  const install = (extra = {}) => f.install(manifest({ version: `1.${version++}.0`, authorEmail: 'author@example.com', ...extra }), 'github');
  await install(); await activate(f.manager);
  for (const extra of [{ author: 'Other publisher' }, { authorEmail: 'other@example.com' }, { authorEmail: undefined }, { permissions: ['storage', 'media'] }, { permissions: [] }]) {
    await install(extra);
    assert.equal(f.manager.get(id).enabled, false); assert.equal(f.manager.get(id).needsConsent, true); assert.equal(f.manager.canRun(id), false);
    await assert.rejects(f.manager.setEnabled(id, true), /consent|accept/i);
    await f.manager.acceptActivation(id, f.manager.get(id).contentHash); assert.equal(f.manager.canRun(id), true);
  }
});

test('local ZIP replacement always requires consent and retains plugin storage', async (t) => {
  const f = await fixture(t); await f.install(); await activate(f.manager); await f.manager.pluginStorageSet(id, 'saved', 17);
  await f.install(manifest({ version: '1.1.0' }));
  assert.equal(f.manager.get(id).needsConsent, true); assert.equal(f.manager.get(id).enabled, false);
  await assert.rejects(f.manager.setEnabled(id, true), /consent|accept/i);
  await f.manager.acceptActivation(id, f.manager.get(id).contentHash); assert.equal(await f.manager.pluginStorageGet(id, 'saved'), 17);
});

test('queued acceptance refuses an installed package replaced after the activation notice', async (t) => {
  const f = await fixture(t); await f.install(); await activate(f.manager); const oldHash = f.manager.get(id).contentHash;
  const next = await f.stage(manifest({ version: '1.1.0' }));
  const replacing = f.manager.confirm(next.token), acceptance = f.manager.acceptActivation(id, oldHash);
  await replacing; await assert.rejects(acceptance, /changed|hash|again/i);
  assert.equal(f.manager.get(id).needsConsent, true); assert.equal(f.manager.canRun(id), false);
});

test('failed receipt or system persistence cannot publish acceptance in memory', async (t) => {
  const f = await fixture(t); await f.install(); const bytes = await readFile(f.registry);
  await rm(f.registry); await mkdir(f.registry);
  await assert.rejects(f.manager.setSystemEnabled(true, true)); assert.deepEqual(f.manager.state.system, { enabled: false, acceptedAt: null });
  await assert.rejects(f.manager.acceptActivation(id, f.manager.get(id).contentHash)); assert.equal(f.manager.get(id).enabled, false); assert.equal(f.manager.get(id).needsConsent, true);
  await rm(f.registry, { recursive: true }); await writeFile(f.registry, bytes);
  await activate(f.manager); assert.equal(f.manager.canRun(id), true);
});

test('failed package commit restores the prior package and its exact consent receipt', async (t) => {
  const f = await fixture(t); await f.install(manifest(), 'github'); await activate(f.manager); const before = f.manager.get(id), bytes = await readFile(f.registry);
  const next = await f.stage(manifest({ version: '1.1.0', author: 'Changed publisher' }), 'github');
  await rm(f.registry); await mkdir(f.registry); await assert.rejects(f.manager.confirm(next.token));
  assert.deepEqual(f.manager.get(id), before); assert.equal(f.manager.canRun(id), true);
  assert.match((await f.manager.readResource(id, 'ui/index.html')).data.toString(), /1\.0\.0/);
  await rm(f.registry, { recursive: true }); await writeFile(f.registry, bytes); assert.equal(f.restart().canRun(id), true);
});

test('optional author contact accepts legacy manifests and rejects malformed, long or control-containing email', () => {
  assert.equal(validatePluginManifest(manifest({ minKitviVersion: '0.4.0' }), '0.6.0').authorEmail, undefined);
  assert.equal(validatePluginManifest(manifest({ authorEmail: 'author+kitvi@example.com' }), '0.6.0').authorEmail, 'author+kitvi@example.com');
  for (const authorEmail of ['', null, 17, 'author', 'author@localhost', ' author@example.com', 'author@example.com ', 'author\n@example.com', 'author\t@example.com', 'author\u0085@example.com', `${'a'.repeat(250)}@example.com`]) assert.throws(() => validatePluginManifest(manifest({ authorEmail }), '0.6.0'), /email|contact/i);
  assert.throws(() => validatePluginManifest(manifest({ needsConsent: false }), '0.6.0'), /unknown/i);
});

test('author contact requires a Kitvi minimum version that supports the manifest field', () => {
  assert.throws(() => validatePluginManifest(manifest({ authorEmail: 'author@example.com', minKitviVersion: '0.5.0' }), '0.6.0'), /0\.6\.0/i);
  assert.equal(validatePluginManifest(manifest({ authorEmail: 'author@example.com' }), '0.6.0').minKitviVersion, '0.6.0');
});
