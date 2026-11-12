import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UpdateService } from '../electron/updater.ts';

const tick = () => new Promise((resolve) => setImmediate(resolve));
const info = (version = '0.4.1') => ({ version, files: [{ url: `Kitvi-${version}-Setup.exe`, sha512: 'verified-by-electron-updater', size: 123 }], path: `Kitvi-${version}-Setup.exe`, sha512: 'verified-by-electron-updater', releaseDate: '2026-11-12T00:00:00.000Z' });
class FakeUpdater extends EventEmitter {
  checkCount = 0; downloadCount = 0; installs = [];
  checkOperation = async () => { const updateInfo = info(); this.emit('update-available', updateInfo); return { updateInfo, isUpdateAvailable: true }; };
  downloadOperation = async () => { this.emit('download-progress', { percent: 43.5, bytesPerSecond: 100, total: 200, transferred: 87 }); this.emit('update-downloaded', info()); return ['cached-setup.exe']; };
  checkForUpdates() { this.checkCount++; return this.checkOperation(); }
  downloadUpdate() { this.downloadCount++; return this.downloadOperation(); }
  quitAndInstall(...args) { this.installs.push(args); }
}
function fixture(t, overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'kitvi-updater-'));
  const resourcesPath = join(directory, 'resources'); mkdirSync(resourcesPath);
  writeFileSync(join(directory, 'Uninstall Kitvi.exe'), 'nsis-test-marker');
  writeFileSync(join(resourcesPath, 'app-update.yml'), 'provider: github\nowner: popop098\nrepo: Kitvi\n');
  const updater = new FakeUpdater();
  const options = { directory: join(directory, 'settings'), currentVersion: '0.4.0', isPackaged: true, executablePath: join(directory, 'Kitvi.exe'), resourcesPath, isBusy: () => false, beforeInstall: async () => {}, log: () => {}, updater, ...overrides };
  const service = new UpdateService(options);
  t.after(() => { service.dispose(); rmSync(directory, { recursive: true, force: true }); });
  return { service, updater, options, directory };
}

test('startup checks once, keeps downloads explicit, and includes release previews without downgrades', async (t) => {
  const { service, updater } = fixture(t);
  service.start(); service.start(); await tick();
  assert.equal(updater.checkCount, 1); assert.equal(updater.downloadCount, 0);
  assert.equal(updater.autoDownload, false); assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updater.allowPrerelease, true); assert.equal(updater.allowDowngrade, false);
  assert.equal(service.state.phase, 'available'); assert.equal(service.state.availableVersion, '0.4.1');
  assert.ok(Date.parse(service.state.checkedAt));
  assert.equal(service.state.releaseUrl, 'https://github.com/popop098/Kitvi/releases');
});

test('turning startup checks off persists but still permits a manual check', async (t) => {
  const { service, updater, options } = fixture(t);
  assert.equal(service.setAutoCheck(false).autoCheck, false);
  const restored = new UpdateService(options); t.after(() => restored.dispose());
  restored.start(); await tick(); assert.equal(updater.checkCount, 0);
  assert.equal(restored.state.autoCheck, false);
  await restored.check(); assert.equal(restored.state.phase, 'available'); assert.equal(updater.checkCount, 1);
  assert.equal(JSON.parse(readFileSync(join(options.directory, 'update-settings.json'), 'utf8')).autoCheck, false);
});

test('parallel checks share one request and a failed check stays actionable', async (t) => {
  const { service, updater } = fixture(t); let rejectCheck;
  updater.checkOperation = () => new Promise((_resolve, reject) => { rejectCheck = reject; });
  const first = service.check(); const second = service.check(); await tick();
  assert.equal(updater.checkCount, 1); assert.equal(service.state.phase, 'checking');
  const failure = new Error('GitHub unavailable'); updater.emit('error', failure); rejectCheck(failure);
  await Promise.all([first, second]);
  assert.equal(service.state.phase, 'error'); assert.match(service.state.message, /GitHub unavailable/); assert.ok(service.state.checkedAt);
  updater.checkOperation = async () => { updater.emit('update-not-available', info('0.4.0')); return { updateInfo: info('0.4.0'), isUpdateAvailable: false }; };
  await service.check(); assert.equal(service.state.phase, 'up-to-date'); assert.equal(service.state.availableVersion, null);
});

test('parallel downloads share progress and never install until an explicit restart', async (t) => {
  const { service, updater } = fixture(t); const seen = []; let finish;
  service.on('state', (state) => seen.push(state)); await service.check();
  updater.downloadOperation = () => new Promise((resolve) => { finish = resolve; });
  const first = service.download(); const second = service.download(); await tick();
  assert.equal(updater.downloadCount, 1); updater.emit('download-progress', { percent: 42.25, bytesPerSecond: 100, total: 400, transferred: 169 });
  assert.equal(service.state.phase, 'downloading'); assert.equal(service.state.progress, 42.25);
  updater.emit('update-downloaded', info()); finish(['cached-setup.exe']); await Promise.all([first, second]);
  assert.equal(service.state.phase, 'downloaded'); assert.equal(service.state.progress, 100); assert.equal(updater.installs.length, 0);
  assert.ok(seen.some((state) => state.phase === 'downloading' && state.progress === 42.25));
  await service.install(); assert.deepEqual(updater.installs, [[false, true]]);
});

test('download failures retain the available version and support retry', async (t) => {
  const { service, updater } = fixture(t); await service.check();
  updater.downloadOperation = async () => { throw new Error('Checksum mismatch'); };
  await service.download(); assert.equal(service.state.phase, 'error'); assert.equal(service.state.availableVersion, '0.4.1');
  assert.match(service.state.message, /Checksum mismatch/); assert.equal(updater.installs.length, 0);
  updater.downloadOperation = async () => { updater.emit('update-downloaded', info()); return ['cached-setup.exe']; };
  await service.download(); assert.equal(service.state.phase, 'downloaded');
});

test('active media jobs prevent restart before cleanup and downloaded state remains usable', async (t) => {
  let busy = true; let cleanups = 0;
  const { service, updater } = fixture(t, { isBusy: () => busy, beforeInstall: async () => { cleanups++; } });
  await service.check(); await service.download();
  await assert.rejects(service.install(), /작업|다운로드/);
  assert.equal(updater.installs.length, 0); assert.equal(cleanups, 0); assert.equal(service.state.phase, 'downloaded'); assert.ok(service.state.message);
  busy = false; await service.install(); assert.equal(cleanups, 1); assert.equal(updater.installs.length, 1);
});

test('a media job appearing during cleanup also blocks installation', async (t) => {
  let busy = false;
  const { service, updater } = fixture(t, { isBusy: () => busy, beforeInstall: async () => { busy = true; } });
  await service.check(); await service.download(); await assert.rejects(service.install(), /작업|다운로드/);
  assert.equal(updater.installs.length, 0); assert.equal(service.state.phase, 'downloaded');
});

test('a synchronous installer throw preserves the downloaded update and permits retry', async (t) => {
  const { service, updater } = fixture(t); const failures = []; let attempts = 0;
  service.on('install-failed', (failure) => failures.push(failure));
  updater.quitAndInstall = (...args) => { if (++attempts === 1) throw new Error('installer permission denied'); updater.installs.push(args); };
  await service.check(); await service.download(); await assert.rejects(service.install(), /installer permission denied/);
  assert.equal(service.state.phase, 'downloaded'); assert.equal(service.state.availableVersion, '0.4.1'); assert.equal(service.state.progress, 100); assert.match(service.state.message, /installer permission denied/);
  assert.equal(failures.length, 1); assert.ok(failures[0] instanceof Error);
  await service.install(); assert.equal(attempts, 2); assert.deepEqual(updater.installs, [[false, true]]); assert.equal(failures.length, 1);
});

test('an emitted installer error rejects installation without losing retry state or duplicating the failure event', async (t) => {
  const { service, updater } = fixture(t); const failures = []; let attempts = 0;
  service.on('install-failed', (failure) => failures.push(failure));
  updater.quitAndInstall = (...args) => { if (++attempts === 1) { updater.emit('error', new Error('installer launch failed')); return; } updater.installs.push(args); };
  await service.check(); await service.download(); await assert.rejects(service.install(), /installer launch failed/);
  assert.equal(service.state.phase, 'downloaded'); assert.equal(service.state.availableVersion, '0.4.1'); assert.equal(service.state.progress, 100); assert.match(service.state.message, /installer launch failed/); assert.equal(failures.length, 1);
  await service.install(); assert.equal(attempts, 2); assert.deepEqual(updater.installs, [[false, true]]); assert.equal(failures.length, 1);
});

test('a settings write failure preserves the previous preference and a downloaded installer', async (t) => {
  const { service, updater, options } = fixture(t); await service.check(); await service.download();
  writeFileSync(options.directory, 'a file cannot hold settings');
  const state = service.setAutoCheck(false);
  assert.equal(state.autoCheck, true); assert.equal(state.phase, 'downloaded'); assert.ok(state.message);
  await service.install(); assert.equal(updater.installs.length, 1);
});

test('a download that resolves without a verified completion event never enables installation', async (t) => {
  const { service, updater } = fixture(t); await service.check();
  updater.downloadOperation = async () => ['unconfirmed-setup.exe'];
  await service.download(); assert.equal(service.state.phase, 'error'); assert.ok(service.state.message);
  await assert.rejects(service.install()); assert.equal(updater.installs.length, 0);
});

test('portable startup checks include previews, skip drafts and downgrades, and keep installation manual', async (t) => {
  const requests = [];
  const { service, updater, directory, options } = fixture(t, { releaseFetch: async (url, init) => {
    requests.push({ url, init });
    return new Response(JSON.stringify([{ tag_name: 'v0.3.9', draft: false }, { tag_name: 'v0.4.1', draft: false }, { tag_name: 'v0.4.2-beta.1', draft: false, prerelease: true }, { tag_name: 'v9.0.0', draft: true }, { tag_name: 'nonsense', draft: false }]));
  } });
  service.dispose(); rmSync(join(directory, 'Uninstall Kitvi.exe'));
  const portable = new UpdateService(options); t.after(() => portable.dispose());
  portable.start(); await portable.check();
  assert.equal(requests.length, 1); assert.equal(requests[0].url, 'https://api.github.com/repos/popop098/Kitvi/releases?per_page=100'); assert.equal(requests[0].init.redirect, 'error');
  assert.equal(portable.state.canInstall, false); assert.equal(portable.state.phase, 'available'); assert.equal(portable.state.availableVersion, '0.4.2-beta.1'); assert.ok(portable.state.message);
  assert.equal(portable.state.releaseUrl, 'https://github.com/popop098/Kitvi/releases'); assert.equal(updater.checkCount, 0);
  await portable.download(); await assert.rejects(portable.install()); assert.equal(updater.downloadCount, 0); assert.equal(updater.installs.length, 0);
});

test('portable manual checks work with startup checks off and never offer older versions', async (t) => {
  let requests = 0;
  const { service, directory, options } = fixture(t, { releaseFetch: async () => { requests++; return new Response(JSON.stringify([{ tag_name: 'v0.3.9' }, { tag_name: 'v0.4.0' }])); } });
  service.setAutoCheck(false); service.dispose(); rmSync(join(directory, 'Uninstall Kitvi.exe'));
  const portable = new UpdateService(options); t.after(() => portable.dispose());
  portable.start(); await tick(); assert.equal(requests, 0); await portable.check();
  assert.equal(requests, 1); assert.equal(portable.state.phase, 'up-to-date'); assert.equal(portable.state.availableVersion, null); assert.ok(portable.state.checkedAt);
});

test('portable checks bound response size and expose recoverable network errors', async (t) => {
  let fetchRelease = async () => new Response('x'.repeat(1024 * 1024 + 1));
  const { service, directory, options } = fixture(t, { releaseFetch: (...args) => fetchRelease(...args) });
  service.dispose(); rmSync(join(directory, 'Uninstall Kitvi.exe'));
  const portable = new UpdateService(options); t.after(() => portable.dispose());
  await portable.check(); assert.equal(portable.state.phase, 'error'); assert.match(portable.state.message, /크기|용량/);
  fetchRelease = async () => new Response('', { status: 403 });
  await portable.check(); assert.equal(portable.state.phase, 'error'); assert.match(portable.state.message, /403/);
  fetchRelease = async () => new Response('[]'); await portable.check(); assert.equal(portable.state.phase, 'up-to-date');
});

test('development builds keep checks disabled without any network access', async (t) => {
  let requests = 0;
  const { service, updater } = fixture(t, { isPackaged: false, releaseFetch: async () => { requests++; throw new Error('network must not run'); } });
  service.start(); await service.check(); await service.download();
  assert.equal(service.state.canInstall, false); assert.equal(service.state.phase, 'disabled'); assert.ok(service.state.message);
  assert.equal(requests, 0); assert.equal(updater.checkCount, 0); await assert.rejects(service.install());
});

test('disposing a portable check aborts its network request and prevents late state changes', async (t) => {
  let signal;
  const { service, directory, options } = fixture(t, { releaseFetch: async (_url, init) => { signal = init.signal; return new Promise((_resolve, reject) => { signal.addEventListener('abort', () => reject(new Error('aborted'))); }); } });
  service.dispose(); rmSync(join(directory, 'Uninstall Kitvi.exe'));
  const portable = new UpdateService(options); const pending = portable.check(); await tick(); portable.dispose(); const previous = portable.state;
  await pending; assert.equal(signal.aborted, true); assert.deepEqual(portable.state, previous);
});

test('portable release requests time out after ten seconds with useful retry guidance', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { service, directory, options } = fixture(t, { releaseFetch: async (_url, init) => new Promise((_resolve, reject) => { init.signal.addEventListener('abort', () => reject(new Error('aborted'))); }) });
  service.dispose(); rmSync(join(directory, 'Uninstall Kitvi.exe'));
  const portable = new UpdateService(options); t.after(() => portable.dispose());
  const pending = portable.check(); await tick(); t.mock.timers.tick(10000); await pending;
  assert.equal(portable.state.phase, 'error'); assert.match(portable.state.message, /시간.*초과/); assert.ok(portable.state.checkedAt);
});

test('disposal suppresses an already queued startup check and ignores late in-flight results', async (t) => {
  const { service, updater, options } = fixture(t);
  service.start(); service.dispose(); await tick(); assert.equal(updater.checkCount, 0);
  const live = new UpdateService(options); let finish; let emissions = 0;
  updater.checkOperation = () => new Promise((resolve) => { finish = resolve; });
  live.on('state', () => { emissions++; }); const pending = live.check(); await tick(); live.dispose(); const before = emissions;
  updater.emit('error', new Error('late error')); updater.emit('update-available', info()); finish({ updateInfo: info(), isUpdateAvailable: true }); await pending;
  assert.equal(emissions, before); assert.equal(updater.listenerCount('update-available'), 0); assert.equal(updater.listenerCount('error'), 0);
});
