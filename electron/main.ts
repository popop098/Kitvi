import { app, BrowserWindow, dialog, ipcMain, Menu, net, powerMonitor, protocol, screen, session, shell } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, watchFile, unwatchFile } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CollectorClient } from './collector-client.ts';
import { SettingsStore } from './settings.ts';
import { restoreBounds } from './window-bounds.ts';
import { UpdateService } from './updater.ts';
import { PluginManager } from './plugins.ts';
import { PluginUpdateService } from './plugin-updates.ts';
import { MediaService } from './media-service.ts';
import { PluginRuntime } from './plugin-runtime.ts';
import type { MediaState, PluginPermission } from '../shared/features.ts';
import type { Appearance, WindowInfo } from '../shared/contracts.ts';

protocol.registerSchemesAsPrivileged(['kitvi', 'kitvi-plugin'].map((scheme) => ({ scheme, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } })));
const designPreview = !app.isPackaged && process.env.KITVI_DESIGN_PREVIEW === '1';
const designRefreshFile = join(__dirname, '../renderer/design-refresh.json');
const ENTRY = `kitvi://app/${designPreview ? 'design-preview.html' : 'index.html'}`;
const dataDirectory = !app.isPackaged && process.env.KITVI_TEST_DATA_DIR
  ? resolve(process.env.KITVI_TEST_DATA_DIR) : join(process.env.LOCALAPPDATA || app.getPath('appData'), 'Kitvi');
app.setPath('userData', dataDirectory);
let window: BrowserWindow | null = null;
let collector: CollectorClient;
let store: SettingsStore;
let updater: UpdateService;
let plugins: PluginManager;
let pluginUpdates: PluginUpdateService;
let runtime: PluginRuntime<MediaService>;
let pluginSystemChanging = false;
const folders = new Map<string, string>();
let dialogBusy = false, installQuit = false;
let stopping = false, stopped = false;
let saveTimer: NodeJS.Timeout | null = null;
function log(message: string) {
  try {
    const directory = join(dataDirectory, 'logs'); mkdirSync(directory, { recursive: true });
    const path = join(directory, 'app.log');
    if (existsSync(path) && statSync(path).size > 1024 * 1024) renameSync(path, path + '.previous');
    appendFileSync(path, `${new Date().toISOString()} ${message}\n`, 'utf8');
  } catch { }
}
function saveWindow() {
  if (!window || window.isDestroyed()) return;
  try { store.save({ bounds: window.getNormalBounds(), maximized: window.isMaximized() }); } catch { log('settings save failed'); }
}
function windowInfo(): WindowInfo { return { maximized: !!window && !window.isDestroyed() && window.isMaximized(), version: app.getVersion() }; }
function sendWindow() { if (window && !window.isDestroyed()) window.webContents.send('window:changed', windowInfo()); }
function authorize(event: IpcMainInvokeEvent) {
  if (!window || window.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== ENTRY) throw new Error('허용되지 않은 요청이에요.');
}
function handle(channel: string, action: (...args: unknown[]) => unknown) {
  ipcMain.handle(channel, (event, ...args: unknown[]) => { authorize(event); return action(...args); });
}
function send(channel: string, value: unknown) { if (window && !window.isDestroyed()) window.webContents.send(channel, value); }
function plugin(id: unknown, permission?: PluginPermission) {
  if (stopping || installQuit || !runtime?.enabled || typeof id !== 'string') throw new Error('요청을 처리할 수 없어요.');
  plugins.assertRunnable(id);
  const found = plugins.get(id);
  if (!found?.enabled || permission && !found.permissions.includes(permission)) throw new Error('플러그인 권한이 없거나 비활성화되어 있어요.');
  return found;
}
function mediaState(id: string): MediaState { return { ...runtime.current.snapshot(id), folder: folders.get(id) || null }; }
function hasActiveJobs(): boolean { return !!runtime?.enabled && runtime.current.hasActiveJobs(); }
function beforePluginCommit() {
  if (stopping || stopped || installQuit) throw new Error('앱을 종료하고 있어요. 다시 실행한 뒤 시도해 주세요.');
  if (hasActiveJobs()) throw new Error('진행 중인 미디어 작업을 완료하거나 취소한 뒤 업데이트해 주세요.');
}
async function pluginRequest(id: unknown, method: unknown, params: unknown): Promise<unknown> {
  const methods: Record<string, PluginPermission> = { 'storage.get': 'storage', 'storage.set': 'storage', 'downloads.chooseFolder': 'downloads', 'downloads.openFolder': 'downloads', 'media.status': 'media', 'media.installEngine': 'media', 'media.analyze': 'media', 'media.start': 'media', 'media.cancel': 'media' };
  if (typeof method !== 'string' || !Object.hasOwn(methods, method)) throw new Error('지원하지 않는 플러그인 API예요.');
  const found = plugin(id, methods[method]);
  const media = runtime.current;
  if (params == null) params = {};
  if (typeof params !== 'object' || Array.isArray(params) || JSON.stringify(params).length > 65536) throw new Error('요청 형식이 올바르지 않아요.');
  const value = params as Record<string, unknown>;
  const keys: Record<string, string[]> = { 'storage.get': ['key'], 'storage.set': ['key','value'], 'downloads.chooseFolder': [], 'downloads.openFolder': [], 'media.status': [], 'media.installEngine': [], 'media.analyze': ['url'], 'media.start': ['url','mode'], 'media.cancel': ['jobId'] };
  if (Object.keys(value).some((key) => !keys[method].includes(key))) throw new Error('허용되지 않은 요청 값이에요.');
  switch (method) {
    case 'storage.get': return plugins.pluginStorageGet(found.id, value.key as string);
    case 'storage.set': return plugins.pluginStorageSet(found.id, value.key as string, value.value);
    case 'downloads.chooseFolder': {
      if (dialogBusy || !window) throw new Error('열려 있는 대화상자를 먼저 닫아 주세요.');
      dialogBusy = true;
      try {
        const selected = await dialog.showOpenDialog(window, { title: `${found.name} 저장 폴더`, properties: ['openDirectory','createDirectory'] });
        plugin(found.id, 'downloads');
        if (runtime.current !== media) throw new Error('플러그인 실행 상태가 변경되었어요. 폴더를 다시 선택해 주세요.');
        if (!selected.canceled && selected.filePaths[0]) folders.set(found.id, selected.filePaths[0]);
        return mediaState(found.id);
      } finally { dialogBusy = false; }
    }
    case 'downloads.openFolder': {
      const path = folders.get(found.id); if (!path) throw new Error('저장 폴더를 먼저 선택해 주세요.');
      const error = await shell.openPath(path); if (error) throw new Error('저장 폴더를 열지 못했어요.'); return;
    }
    case 'media.status': return mediaState(found.id);
    case 'media.installEngine': await media.ensureEngine(); plugin(found.id, 'media'); if (runtime.current !== media) throw new Error('플러그인 실행 상태가 변경되었어요.'); return mediaState(found.id);
    case 'media.analyze': return media.analyze(found.id, value.url as string);
    case 'media.start': {
      plugin(found.id, 'downloads');
      const directory = folders.get(found.id); if (!directory) throw new Error('저장 폴더를 먼저 선택해 주세요.');
      return media.start(found.id, { url: value.url as string, mode: value.mode as 'video'|'audio', directory });
    }
    case 'media.cancel': if (typeof value.jobId !== 'string') throw new Error('작업 ID를 확인해 주세요.'); return media.cancel(found.id, value.jobId);
  }
}
function setupIpc() {
  handle('system:get', () => collector.state);
  handle('system:refresh', () => designPreview ? undefined : collector.refresh());
  handle('system:retry', () => designPreview ? undefined : collector.retry());
  handle('appearance:get', () => store.value.appearance);
  handle('appearance:set', (value) => {
    if (value !== 'light' && value !== 'dark') throw new Error('화면 모드가 올바르지 않아요.');
    store.save({ appearance: value as Appearance });
    window?.setBackgroundColor(value === 'dark' ? '#1b1b1b' : '#f1f1f1');
    return value;
  });
  handle('window:get', () => windowInfo());
  handle('window:minimize', () => { window?.minimize(); });
  handle('window:maximize', () => { if (window?.isMaximized()) window.unmaximize(); else window?.maximize(); });
  handle('window:close', () => { window?.close(); });
  handle('update:get', () => updater.state);
  handle('update:check', () => updater.check());
  handle('update:auto', (value) => { if (typeof value !== 'boolean') throw new Error('설정값을 확인해 주세요.'); return updater.setAutoCheck(value); });
  handle('update:download', () => updater.download());
  handle('update:install', () => updater.install());
  handle('update:release', () => shell.openExternal('https://github.com/popop098/Kitvi/releases'));
  handle('plugins:get', () => plugins.state);
  handle('plugins:system', async (enabled, acceptNotice) => {
    if (typeof enabled !== 'boolean' || acceptNotice !== undefined && typeof acceptNotice !== 'boolean') throw new Error('설정값을 확인해 주세요.');
    if (pluginSystemChanging || stopping || installQuit) throw new Error('변경 중이에요. 잠시 뒤 다시 시도해 주세요.');
    pluginSystemChanging = true;
    try {
      if (!enabled) {
        pluginUpdates.setPaused(true);
        folders.clear();
        const cleanup = runtime.setEnabled(false);
        // Handle cleanup rejection even if persisting the switch also fails.
        const results = await Promise.allSettled([plugins.setSystemEnabled(false), cleanup]);
        for (const result of results) if (result.status === 'rejected') throw result.reason;
      } else {
        await plugins.setSystemEnabled(true, acceptNotice === true);
        try { await runtime.setEnabled(true); }
        catch (error) { await plugins.setSystemEnabled(false); throw error; }
        pluginUpdates.setPaused(false);
      }
      return plugins.state;
    } finally { pluginSystemChanging = false; send('plugins:changed', plugins.state); }
  });
  handle('plugins:accept', (id, contentHash) => {
    if (typeof id !== 'string' || typeof contentHash !== 'string' || !/^[a-f0-9]{64}$/.test(contentHash)) throw new Error('플러그인 확인값을 확인해 주세요.');
    return plugins.acceptActivation(id, contentHash);
  });
  handle('plugin-updates:get', () => pluginUpdates.state);
  handle('plugin-updates:check', () => pluginUpdates.check());
  handle('plugin-updates:auto', (value) => { if (typeof value !== 'boolean') throw new Error('설정값을 확인해 주세요.'); return pluginUpdates.setAutoCheck(value); });
  handle('plugin-updates:apply', (id) => { if (typeof id !== 'string' || id.length > 128) throw new Error('플러그인을 확인해 주세요.'); beforePluginCommit(); return pluginUpdates.apply(id); });
  handle('plugins:preview', (repository) => { if (typeof repository !== 'string' || repository.length > 300) throw new Error('저장소를 확인해 주세요.'); return plugins.previewRepository(repository); });
  handle('plugins:local', async () => {
    if (dialogBusy || !window) throw new Error('열려 있는 대화상자를 먼저 닫아 주세요.');
    dialogBusy = true;
    try { const selected = await dialog.showOpenDialog(window, { title: 'Kitvi 플러그인 패키지', properties: ['openFile'], filters: [{ name: 'Kitvi 플러그인', extensions: ['zip'] }] }); return selected.canceled || !selected.filePaths[0] ? null : await plugins.previewFile(selected.filePaths[0]); }
    finally { dialogBusy = false; }
  });
  handle('plugins:confirm', (token) => { if (typeof token !== 'string' || token.length > 128) throw new Error('설치 확인값을 확인해 주세요.'); if (hasActiveJobs()) throw new Error('진행 중인 미디어 작업을 완료한 뒤 설치해 주세요.'); return plugins.confirm(token); });
  handle('plugins:enable', (id, enabled) => {
    if (typeof id !== 'string' || typeof enabled !== 'boolean') throw new Error('설정값을 확인해 주세요.');
    if (hasActiveJobs()) throw new Error('진행 중인 미디어 작업을 완료하거나 취소한 뒤 변경해 주세요.');
    folders.delete(id); return plugins.setEnabled(id, enabled);
  });
  handle('plugins:remove', (id) => {
    if (typeof id !== 'string') throw new Error('플러그인을 확인해 주세요.');
    if (hasActiveJobs()) throw new Error('진행 중인 미디어 작업을 완료하거나 취소한 뒤 삭제해 주세요.');
    folders.delete(id); return plugins.remove(id);
  });
  handle('plugins:invoke', pluginRequest);
  handle('media:get', (id) => {
    const found = plugin(id);
    return found.permissions.includes('media') ? mediaState(found.id) : { engine: { phase: 'missing', version: null, progress: null, message: null }, jobs: [], folder: null };
  });
}

async function createWindow() {
  const primary = screen.getPrimaryDisplay();
  const displays = [primary, ...screen.getAllDisplays().filter((display) => display.id !== primary.id)];
  const bounds = restoreBounds(store.value.bounds, displays.map((display) => display.workArea));
  const workArea = screen.getDisplayMatching(bounds).workArea;
  const restoreMaximized = store.value.maximized;
  window = new BrowserWindow({ ...bounds, minWidth: Math.min(960, workArea.width), minHeight: Math.min(640, workArea.height),
    title: designPreview ? 'Kitvi · 디자인 작업실' : 'Kitvi', icon: join(__dirname, '../renderer/kitvi.ico'), frame: false, transparent: false, roundedCorners: true, show: false, autoHideMenuBar: true,
    backgroundColor: store.value.appearance === 'dark' ? '#1b1b1b' : '#f1f1f1',
    webPreferences: { preload: join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, spellcheck: false, devTools: !app.isPackaged } });
  window.setMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (url !== ENTRY) event.preventDefault(); });
  window.webContents.on('will-frame-navigate', (event) => {
    if (event.isMainFrame) { if (event.url !== ENTRY) event.preventDefault(); return; }
    try { const url = new URL(event.url); if (event.frame?.url.startsWith('kitvi-plugin:') || url.protocol !== 'kitvi-plugin:' || !runtime.enabled || !plugins.canRun(url.hostname)) event.preventDefault(); }
    catch { event.preventDefault(); }
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.on('page-title-updated', (event) => event.preventDefault());
  window.webContents.on('render-process-gone', (_event, detail) => log(`renderer stopped: ${detail.reason}`));
  window.webContents.on('did-fail-load', (_event, code) => log(`renderer load failed: ${code}`));
  window.webContents.on('did-finish-load', () => {
    if (window && !window.isDestroyed()) { window.webContents.send('system:changed', collector.state); sendWindow(); }
  });
  window.on('maximize', () => { saveWindow(); sendWindow(); }); window.on('unmaximize', () => { saveWindow(); sendWindow(); });
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer); saveTimer = setTimeout(saveWindow, 300);
  };
  window.on('move', scheduleSave); window.on('resize', scheduleSave);
  window.on('close', (event) => {
    if (!stopping && !installQuit && hasActiveJobs() && window) {
      const choice = dialog.showMessageBoxSync(window, { type: 'warning', title: 'Kitvi 종료', message: '진행 중인 다운로드가 있어요.', detail: '종료하면 진행 중인 작업이 취소됩니다.', buttons: ['계속 사용', '작업 취소 후 종료'], defaultId: 0, cancelId: 0 });
      if (choice === 0) { event.preventDefault(); return; }
    }
    saveWindow();
  });
  window.on('closed', () => { window = null; });
  window.once('ready-to-show', () => { if (restoreMaximized) window?.maximize(); window?.show(); });
  await window.loadURL(ENTRY);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.whenReady().then(async () => {
    app.setAppUserModelId('com.popop098.kitvi'); Menu.setApplicationMenu(null);
    store = new SettingsStore(dataDirectory);
    plugins = new PluginManager({ directory: dataDirectory, appVersion: app.getVersion(), beforeCommit: beforePluginCommit, log });
    runtime = new PluginRuntime(() => {
      const media = new MediaService({ directory: join(dataDirectory, 'media-engine'), runtimeExecutable: process.execPath, log });
      media.on('state', () => {
        if (!runtime.enabled || runtime.current !== media) return;
        const base = media.snapshot('');
        send('media:changed', { ...base, jobs: plugins.state.plugins.filter((item) => plugins.canRun(item.id)).flatMap((item) => media.snapshot(item.id).jobs), folder: null });
      });
      return media;
    });
    await runtime.setEnabled(plugins.state.system.enabled);
    pluginUpdates = new PluginUpdateService({ directory: dataDirectory, appVersion: app.getVersion(), manager: plugins, beforeApply: beforePluginCommit, log });
    pluginUpdates.on('state', (state) => send('plugin-updates:changed', state));
    updater = new UpdateService({ directory: dataDirectory, currentVersion: app.getVersion(), isPackaged: app.isPackaged, executablePath: process.execPath, resourcesPath: process.resourcesPath,
      isBusy: () => hasActiveJobs() || plugins.state.busy || pluginSystemChanging,
      beforeInstall: async () => { installQuit = true; saveWindow(); }, log });
    updater.on('state', (state) => send('update:changed', state));
    updater.on('install-failed', () => { installQuit = false; });
    plugins.on('state', (state) => { if (!pluginSystemChanging) send('plugins:changed', state); });
    const rendererRoot = resolve(__dirname, '../renderer');
    protocol.handle('kitvi', async (request) => {
      try {
        const url = new URL(request.url);
        if (url.hostname !== 'app' || request.method !== 'GET') return new Response('Not found', { status: 404 });
        const file = resolve(rendererRoot, '.' + decodeURIComponent(url.pathname));
        const path = relative(rendererRoot, file);
        if (path.startsWith('..' + sep) || path === '..' || path.includes(':') || !existsSync(file) || !statSync(file).isFile()) return new Response('Not found', { status: 404 });
        const response = await net.fetch(pathToFileURL(file).toString());
        const headers = new Headers(response.headers);
        headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-src kitvi-plugin:; form-action 'none'");
        headers.set('X-Content-Type-Options', 'nosniff');
        const body = file.endsWith('.html') ? (await response.text())
          .replace('data-appearance="light"', `data-appearance="${store.value.appearance}"`)
          .replace('data-theme="light"', `data-theme="${store.value.appearance}"`) : response.body;
        return new Response(body, { status: response.status, headers });
      } catch { return new Response('Not found', { status: 404 }); }
    });
    protocol.handle('kitvi-plugin', async (request) => {
      try {
        const url = new URL(request.url);
        if (request.method !== 'GET' || url.username || url.password || url.port || !runtime.enabled || !plugins.canRun(url.hostname)) return new Response('Not found', { status: 404 });
        const resource = await plugins.readResource(url.hostname, decodeURIComponent(url.pathname).replace(/^\//, ''));
        return new Response(new Uint8Array(resource.data), { headers: { 'Content-Type': resource.mime, 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox allow-scripts; default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'" } });
      } catch { return new Response('Not found', { status: 404 }); }
    });
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    const executable = app.isPackaged ? join(process.resourcesPath, 'collector/Kitvi.Collector.exe') : resolve(__dirname, '../../native/publish/Kitvi.Collector.exe');
    collector = new CollectorClient({ executable, log });
    collector.on('state', (state) => { if (window && !window.isDestroyed()) window.webContents.send('system:changed', state); });
    setupIpc();
    if (!designPreview) {
      collector.start();
      powerMonitor.on('resume', () => {
        collector.notifyResume(); if (collector.state.collector.state === 'running') collector.refresh().catch(() => log('resume refresh incomplete'));
        if (pluginUpdates.state.autoCheck) void pluginUpdates.check().catch(() => log('plugin update resume check incomplete'));
      });
      screen.on('display-added', () => collector.refresh().catch(() => {}));
      screen.on('display-removed', () => collector.refresh().catch(() => {}));
    }
    await createWindow();
    if (!designPreview) { updater.start(); pluginUpdates.start(); }
    if (designPreview && process.env.KITVI_DESIGN_WATCH === '1') {
      watchFile(designRefreshFile, { interval: 250 }, (current, previous) => {
        if (current.mtimeMs > previous.mtimeMs && window && !window.isDestroyed()) window.webContents.reloadIgnoringCache();
      });
    }
  }).catch(() => { log('application initialization failed'); app.quit(); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', (event) => {
    if (stopped) return;
    event.preventDefault();
    if (stopping) return;
    stopping = true; if (saveTimer) clearTimeout(saveTimer); saveWindow(); unwatchFile(designRefreshFile);
    updater?.dispose();
    Promise.allSettled([collector?.stop(), runtime?.stop(), (async () => { await pluginUpdates?.dispose(); await plugins?.dispose(); })()]).finally(() => { stopped = true; app.quit(); });
  });
}
