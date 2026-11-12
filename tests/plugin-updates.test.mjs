import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, readdir, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PluginManager } from '../electron/plugins.ts';
import { PluginUpdateService } from '../electron/plugin-updates.ts';

const manifest = (extra = {}) => ({ apiVersion: 1, id: 'kitvi.test-plugin', name: 'Test plugin', version: '1.0.0', minKitviVersion: '0.4.0', description: 'A static plugin.', author: 'Kitvi', entry: 'ui/index.html', permissions: ['storage'], ...extra });
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
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'kitvi-plugin-updates-'));
  const manager = new PluginManager({ directory, appVersion: '0.5.0', log: () => {}, beforeCommit: options.beforeCommit });
  if (options.consent !== false) await manager.setSystemEnabled(true, true);
  const releases = new Map(), calls = []; const originalFetch = globalThis.fetch; let handler;
  const publish = (value = manifest(), repo = 'example/plugin', extra = {}) => {
    const data = zip(value), base = `https://github.com/${repo}/releases/download/v${value.version}/`;
    const release = { tag_name: `v${value.version}`, draft: false, prerelease: false, assets: [{ name: 'test.kitvi-plugin.zip', size: data.length, browser_download_url: `${base}test.kitvi-plugin.zip` }, { name: 'SHA256SUMS.txt', size: 100, browser_download_url: `${base}SHA256SUMS.txt` }], ...extra };
    releases.set(repo, { data, base, release }); return release;
  };
  globalThis.fetch = async (url, init) => {
    const target = String(url); calls.push(target);
    if (handler) { const result = await handler(target, init); if (result) return result; }
    for (const [repo, item] of releases) {
      if (target === `https://api.github.com/repos/${repo}/releases/latest`) return new Response(JSON.stringify(item.release));
      if (target === `${item.base}SHA256SUMS.txt`) return new Response(`${createHash('sha256').update(item.data).digest('hex')}  test.kitvi-plugin.zip\n`);
      if (target === `${item.base}test.kitvi-plugin.zip`) return new Response(item.data);
    }
    throw new Error(`Unexpected network URL: ${target}`);
  };
  const services = [];
  const service = (extra = {}) => { const result = new PluginUpdateService({ directory, appVersion: '0.5.0', manager, beforeApply: () => {}, log: () => {}, ...options.service, ...extra }); services.push(result); return result; };
  t.after(async () => { for (const item of services) await item.dispose(); await manager.dispose(); globalThis.fetch = originalFetch; await rm(directory, { recursive: true, force: true }); });
  return { directory, manager, publish, calls, service, intercept: (value) => { handler = value; }, install: async (value = manifest(), repo = 'example/plugin') => { publish(value, repo); await manager.confirm((await manager.previewRepository(repo)).token); if (options.consent !== false) await manager.acceptActivation(value.id, manager.get(value.id).contentHash); calls.length = 0; } };
}

test('does not contact plugin repositories before global plugin consent', async (t) => {
  const f = await fixture(t, { consent: false }); await f.install();
  const service = f.service(); service.start();
  await service.check();
  assert.deepEqual(f.calls, [], 'global plugin gate must also block background release checks');
  assert.equal(service.state.checking, false);
});

test('checks only release metadata, deduplicates repositories and includes disabled plugins', async (t) => {
  const f = await fixture(t); await f.install(); await f.install(manifest({ id: 'kitvi.second-plugin' }));
  await f.manager.setEnabled('kitvi.test-plugin', false);
  const local = path.join(f.directory, 'local.kitvi-plugin.zip'); await writeFile(local, zip(manifest({ id: 'kitvi.local-plugin' })));
  await f.manager.confirm((await f.manager.previewFile(local)).token);
  f.publish(manifest({ version: '1.2.0' })); const service = f.service();
  const first = service.check(), second = service.check(); assert.equal(first, second);
  const result = await first;
  assert.equal(result.checking, false);
  assert.deepEqual(result.plugins.map(({ id, status, availableVersion }) => ({ id, status, availableVersion })), [
    { id: 'kitvi.test-plugin', status: 'available', availableVersion: '1.2.0' }, { id: 'kitvi.second-plugin', status: 'available', availableVersion: '1.2.0' }, { id: 'kitvi.local-plugin', status: 'unsupported', availableVersion: null },
  ]);
  assert.deepEqual(f.calls, ['https://api.github.com/repos/example/plugin/releases/latest']);
  assert.deepEqual(await readdir(path.join(f.directory, 'plugins', 'staging')), []);
});

test('auto-check defaults on, persists separately, and off still permits manual checks', async (t) => {
  const f = await fixture(t); await f.install(); const service = f.service(); assert.equal(service.state.autoCheck, true);
  service.setAutoCheck(false); service.start(); await new Promise((resolve) => setImmediate(resolve)); assert.deepEqual(f.calls, []);
  const saved = JSON.parse(await readFile(path.join(f.directory, 'plugin-update-settings.json'), 'utf8')); assert.equal(saved.autoCheck, false);
  assert.equal(f.service().state.autoCheck, false);
  assert.equal((await service.check()).plugins[0].status, 'current');
  assert.equal(JSON.parse(await readFile(path.join(f.directory, 'plugins', 'registry.json'), 'utf8')).plugins[0].availableVersion, undefined);
});

test('start checks immediately and repeats until auto-check is switched off', async (t) => {
  const f = await fixture(t); await f.install(); const service = f.service({ intervalMs: 20 });
  const repeated = deferred(); service.on('state', (state) => { if (!state.checking && f.calls.length >= 2) repeated.resolve(); });
  service.start(); await Promise.race([repeated.promise, new Promise((_, reject) => setTimeout(() => reject(new Error('periodic check did not run')), 1000))]);
  service.setAutoCheck(false); const count = f.calls.length; await new Promise((resolve) => setTimeout(resolve, 60)); assert.equal(f.calls.length, count);
});

test('invalid, prerelease and draft tags never become update candidates', async (t) => {
  const f = await fixture(t); await f.install(); const service = f.service();
  for (const extra of [{ tag_name: 'release-9.0' }, { tag_name: 'v9.0.0-beta.1' }, { tag_name: 'v9.0.0', prerelease: true }, { tag_name: 'v9.0.0', draft: true }, { tag_name: ' v9.0.0' }]) {
    f.publish(manifest({ version: '9.0.0' }), 'example/plugin', extra);
    const result = await service.check(); assert.equal(result.plugins[0].status, 'error'); assert.equal(result.plugins[0].availableVersion, null);
  }
});

test('rate limits, offline errors, oversized bodies and timeouts produce retryable check errors', async (t) => {
  const f = await fixture(t); await f.install(); const service = f.service({ timeoutMs: 15 });
  for (const handler of [async () => new Response('rate limit', { status: 403 }), async () => { throw new Error('Offline'); }, async () => new Response('x'.repeat(1024 * 1024 + 1)), async (_url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('Timed out')), { once: true }))]) {
    f.intercept(handler); const result = await service.check(); assert.equal(result.plugins[0].status, 'error'); assert.ok(result.plugins[0].message); assert.equal(result.checking, false);
  }
  f.intercept(null); assert.equal((await service.check()).plugins[0].status, 'current');
});

test('slow checks do not hold the storage queue and discard results after removal', async (t) => {
  const f = await fixture(t); await f.install(); const service = f.service(); const response = deferred(), entered = deferred();
  f.intercept(async () => { entered.resolve(); return response.promise; });
  const checking = service.check(); await entered.promise;
  await f.manager.pluginStorageSet('kitvi.test-plugin', 'during-check', 42);
  assert.equal(await f.manager.pluginStorageGet('kitvi.test-plugin', 'during-check'), 42);
  await f.manager.remove('kitvi.test-plugin');
  response.resolve(new Response(JSON.stringify({ tag_name: 'v9.0.0', draft: false, prerelease: false })));
  assert.deepEqual((await checking).plugins, []);
});

test('storage and enabled-state notifications retain completed metadata without another request', async (t) => {
  const f = await fixture(t); await f.install(); f.publish(manifest({ version: '1.1.0' })); const service = f.service(); await service.check();
  await f.manager.pluginStorageSet('kitvi.test-plugin', 'saved', 'keep'); await f.manager.setEnabled('kitvi.test-plugin', false);
  assert.equal(service.state.plugins[0].status, 'available'); assert.equal(f.calls.length, 1);
});

test('late metadata cannot overwrite an intervening version or same-version reinstall from a different source', async (t) => {
  const f = await fixture(t); await f.install(); const service = f.service();
  for (const replacement of [{ version: '1.1.0', repo: 'example/plugin' }, { version: '1.1.0', repo: 'other/plugin' }]) {
    const response = deferred(), entered = deferred();
    f.intercept(async (url) => { if (url.startsWith('https://api.github.com/repos/example/plugin/')) { entered.resolve(); return response.promise; } return null; });
    const checking = service.check(); await entered.promise; f.intercept(null);
    if (replacement.repo !== 'example/plugin') await f.manager.remove('kitvi.test-plugin');
    await f.install(manifest({ version: replacement.version }), replacement.repo);
    response.resolve(new Response(JSON.stringify({ tag_name: 'v9.0.0', draft: false, prerelease: false })));
    const result = await checking; assert.equal(result.plugins[0].availableVersion, null); assert.equal(result.plugins[0].status, 'idle'); assert.equal(result.plugins[0].currentVersion, '1.1.0');
  }
});

test('bounded repository checks never exceed configured concurrency', async (t) => {
  const f = await fixture(t); for (let index = 0; index < 5; index++) await f.install(manifest({ id: `kitvi.plugin-${index}` }), `example/plugin-${index}`);
  let active = 0, maximum = 0;
  f.intercept(async () => { active++; maximum = Math.max(maximum, active); await new Promise((resolve) => setTimeout(resolve, 10)); active--; return new Response(JSON.stringify({ tag_name: 'v1.1.0', draft: false, prerelease: false })); });
  const result = await f.service({ concurrency: 2 }).check(); assert.equal(maximum, 2); assert.equal(result.plugins.filter((item) => item.status === 'available').length, 5);
});

test('applying unchanged permissions installs once, retains disabled state and data', async (t) => {
  const f = await fixture(t); await f.install(); await f.manager.pluginStorageSet('kitvi.test-plugin', 'saved', 17); await f.manager.setEnabled('kitvi.test-plugin', false);
  f.publish(manifest({ version: '1.1.0' })); const service = f.service(); await service.check(); f.calls.length = 0;
  const first = service.apply('kitvi.test-plugin'), second = service.apply('kitvi.test-plugin'); assert.equal(first, second);
  assert.equal((await first).kind, 'applied'); assert.equal(f.manager.get('kitvi.test-plugin').version, '1.1.0'); assert.equal(f.manager.get('kitvi.test-plugin').enabled, false);
  await f.manager.setEnabled('kitvi.test-plugin', true); assert.equal(await f.manager.pluginStorageGet('kitvi.test-plugin', 'saved'), 17);
  assert.equal(f.calls.filter((url) => url.endsWith('.zip')).length, 1); assert.equal(service.state.plugins[0].availableVersion, null);
});

test('every permission change requires review and invalidates activation consent', async (t) => {
  const f = await fixture(t); await f.install(); const service = f.service();
  f.publish(manifest({ version: '1.1.0', permissions: ['storage', 'media'] })); const result = await service.apply('kitvi.test-plugin');
  assert.equal(result.kind, 'review'); assert.deepEqual(result.preview.permissions, ['storage', 'media']); assert.equal(f.manager.get('kitvi.test-plugin').version, '1.0.0');
  await f.manager.confirm(result.preview.token); assert.equal(f.manager.get('kitvi.test-plugin').version, '1.1.0');
  assert.equal(f.manager.get('kitvi.test-plugin').needsConsent, true);
  await f.manager.acceptActivation('kitvi.test-plugin', f.manager.get('kitvi.test-plugin').contentHash);
  f.publish(manifest({ version: '1.2.0', permissions: [] }));
  const reduced = await service.apply('kitvi.test-plugin'); assert.equal(reduced.kind, 'review');
  await f.manager.confirm(reduced.preview.token); assert.equal(f.manager.canRun('kitvi.test-plugin'), false);
});

test('global off aborts in-flight metadata, preserves preference and reenable resumes checks', async (t) => {
  const f = await fixture(t); await f.install(); const stalled = deferred(); let observed;
  f.intercept(async (_url, init) => { observed = init.signal; await stalled.promise; return new Response(JSON.stringify({ tag_name: 'v9.0.0', draft: false, prerelease: false })); });
  const service = f.service(); const checking = service.check();
  while (!observed) await new Promise(resolve => setImmediate(resolve));
  await f.manager.setSystemEnabled(false); assert.equal(observed.aborted, true);
  stalled.resolve(); await checking;
  assert.equal(service.state.autoCheck, true); assert.equal(service.state.plugins[0].availableVersion, null);
  const count = f.calls.length; await service.check(); assert.equal(f.calls.length, count);
  await assert.rejects(service.apply('kitvi.test-plugin'), /켜/);
  f.intercept(undefined); f.publish(manifest({ version: '1.3.0' }));
  await f.manager.setSystemEnabled(true); await service.check();
  assert.equal(service.state.plugins[0].availableVersion, '1.3.0');
});

test('immediate pause cancels an apply before queued global off can reach the registry', async (t) => {
  const f = await fixture(t); await f.install(); f.publish(manifest({ version: '1.1.0' }));
  const started = deferred(); let signal;
  f.intercept(async (url, init) => {
    if (!url.endsWith('.zip')) return;
    signal = init.signal; started.resolve();
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  });
  const service = f.service(), applying = service.apply('kitvi.test-plugin'); applying.catch(() => {});
  await started.promise;
  service.setPaused(true);
  assert.equal(signal.aborted, true, 'off must revoke network before waiting for the mutation queue');
  const disabling = f.manager.setSystemEnabled(false);
  await assert.rejects(applying); await disabling;
  assert.equal(f.manager.get('kitvi.test-plugin').version, '1.0.0');
  const count = f.calls.length; await service.check(); assert.equal(f.calls.length, count);
  f.intercept(undefined); await f.manager.setSystemEnabled(true);
  await service.check(); assert.equal(f.calls.length, count, 'transient pause remains until runtime is ready');
  service.setPaused(false); await service.check();
  assert.equal(service.state.plugins[0].availableVersion, '1.1.0');
});

test('apply rejects different IDs, tag mismatch, host incompatibility and checksum failure without installing', async (t) => {
  const f = await fixture(t); await f.install(); const service = f.service(); const before = f.manager.get('kitvi.test-plugin');
  for (const [value, extra, pattern] of [[{ id: 'kitvi.attacker', version: '1.1.0' }, {}, /ID/i], [{ version: '1.1.0' }, { tag_name: 'v1.2.0' }, /version|tag/i], [{ version: '1.1.0', minKitviVersion: '9.0.0' }, {}, /requires Kitvi/i], [{ version: '1.0.0' }, {}, /newer/i]]) {
    f.publish(manifest(value), 'example/plugin', extra); await assert.rejects(service.apply('kitvi.test-plugin'), pattern); assert.deepEqual(f.manager.get('kitvi.test-plugin'), before); assert.deepEqual(await readdir(path.join(f.directory, 'plugins', 'staging')), []);
  }
  f.publish(manifest({ version: '1.1.0' })); f.intercept(async (url) => url.endsWith('SHA256SUMS.txt') ? new Response(`${'0'.repeat(64)}  test.kitvi-plugin.zip\n`) : null);
  await assert.rejects(service.apply('kitvi.test-plugin'), /checksum/i); assert.deepEqual(f.manager.get('kitvi.test-plugin'), before);
});

test('review binding refuses a preview after an intervening update or removal', async (t) => {
  const f = await fixture(t); await f.install(); const service = f.service();
  f.publish(manifest({ version: '1.2.0', permissions: ['storage', 'media'] })); const result = await service.apply('kitvi.test-plugin'); assert.equal(result.kind, 'review');
  f.publish(manifest({ version: '1.1.0' })); await f.manager.confirm((await f.manager.previewRepository('example/plugin')).token);
  await assert.rejects(f.manager.confirm(result.preview.token), /changed|stale|again/i); assert.equal(f.manager.get('kitvi.test-plugin').version, '1.1.0');
  f.publish(manifest({ version: '1.3.0', permissions: ['storage', 'media'] })); const next = await service.apply('kitvi.test-plugin'); await f.manager.remove('kitvi.test-plugin');
  await assert.rejects(f.manager.confirm(next.preview.token)); assert.equal(f.manager.get('kitvi.test-plugin'), undefined);
});

test('registry commit failure restores the old package and preserves an available update for retry', async (t) => {
  const f = await fixture(t); await f.install(); const service = f.service(); f.publish(manifest({ version: '1.1.0' })); await service.check();
  const registry = path.join(f.directory, 'plugins', 'registry.json'), stored = await readFile(registry); const before = f.manager.get('kitvi.test-plugin');
  await rm(registry); await mkdir(registry);
  await assert.rejects(service.apply('kitvi.test-plugin'));
  assert.deepEqual(f.manager.get('kitvi.test-plugin'), before); assert.match((await f.manager.readResource('kitvi.test-plugin', 'ui/index.html')).data.toString(), /1\.0\.0/);
  assert.equal(service.state.plugins[0].status, 'error'); assert.equal(service.state.plugins[0].availableVersion, '1.1.0');
  await rm(registry, { recursive: true }); await writeFile(registry, stored);
  assert.equal((await service.apply('kitvi.test-plugin')).kind, 'applied'); assert.equal(f.manager.get('kitvi.test-plugin').version, '1.1.0');
});

test('apply derives source from installed records, blocks local packages and honors host guards', async (t) => {
  let blocked = false; const f = await fixture(t, { beforeCommit: () => { if (blocked) throw new Error('Host busy'); } }); await f.install();
  const service = f.service({ beforeApply: () => { if (blocked) throw new Error('Host busy'); } });
  f.publish(manifest({ version: '1.1.0' })); blocked = true; await assert.rejects(service.apply('kitvi.test-plugin'), /Host busy/); assert.deepEqual(f.calls, []);
  blocked = false; f.intercept(async (url) => { if (url.endsWith('.zip')) blocked = true; return null; });
  await assert.rejects(service.apply('kitvi.test-plugin'), /Host busy/); assert.equal(f.manager.get('kitvi.test-plugin').version, '1.0.0');
  f.intercept(null); blocked = false;
  const file = path.join(f.directory, 'local.kitvi-plugin.zip'); await writeFile(file, zip(manifest({ id: 'kitvi.local-plugin' }))); await f.manager.confirm((await f.manager.previewFile(file)).token);
  f.calls.length = 0; await assert.rejects(service.apply('kitvi.local-plugin'), /local|ZIP|GitHub/i); await assert.rejects(service.apply('kitvi.missing')); assert.deepEqual(f.calls, []);
});

test('dispose aborts in-flight metadata and prevents subsequent network checks', async (t) => {
  const f = await fixture(t); await f.install(); const entered = deferred();
  f.intercept(async (_url, init) => new Promise((_, reject) => { entered.resolve(); init.signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true }); }));
  const service = f.service(); const checking = service.check(); await entered.promise; await service.dispose(); await checking; const count = f.calls.length; await service.check(); service.start(); assert.equal(f.calls.length, count);
});

test('dispose cancels a stalled apply request without replacing the installed package', async (t) => {
  for (const phase of ['metadata', 'checksum', 'archive']) await t.test(phase, async (t) => {
    const f = await fixture(t); await f.install(); f.publish(manifest({ version: '1.1.0' }));
    const entered = deferred(), aborted = deferred(), stalled = deferred(); const before = f.manager.get('kitvi.test-plugin');
    f.intercept(async (url, init) => {
      const matches = phase === 'metadata' ? url.startsWith('https://api.github.com/') : phase === 'checksum' ? url.endsWith('SHA256SUMS.txt') : url.endsWith('.zip');
      if (!matches) return null;
      return new Promise((resolve, reject) => {
        stalled.promise.then(resolve, reject);
        entered.resolve(); init.signal.addEventListener('abort', () => { aborted.resolve(); reject(init.signal.reason); }, { once: true });
      });
    });
    const service = f.service(), applying = service.apply('kitvi.test-plugin');
    const rejected = assert.rejects(applying, /abort/i); await entered.promise;
    const cleanup = service.dispose();
    let timeout;
    const observedAbort = await Promise.race([aborted.promise.then(() => true), new Promise((resolve) => { timeout = setTimeout(() => resolve(false), 250); })]);
    clearTimeout(timeout);
    if (!observedAbort) stalled.reject(new DOMException('Test cleanup aborted the request', 'AbortError'));
    await cleanup; await rejected;
    assert.equal(observedAbort, true, `Disposal did not abort the stalled ${phase} request`);
    assert.deepEqual(f.manager.get('kitvi.test-plugin'), before);
    assert.match((await f.manager.readResource('kitvi.test-plugin', 'ui/index.html')).data.toString(), /1\.0\.0/);
    assert.deepEqual(await readdir(path.join(f.directory, 'plugins', 'staging')), []);
  });
});
