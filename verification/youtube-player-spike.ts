import { app, BrowserWindow } from 'electron';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ThemePlaybackService, YOUTUBE_APP_ORIGIN, createElectronYouTubeSurface } from '../electron/theme-playback.ts';
import type { ThemeCatalogEntry } from '../shared/themes.ts';

if (!process.env.KITVI_PLAYER_SPIKE_DIR) app.exit(2);
const directory = process.env.KITVI_PLAYER_SPIKE_DIR!;
app.setPath('userData', join(directory, 'profile'));
app.setAppUserModelId('com.popop098.kitvi');
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const report: Record<string, unknown> = { mechanics: 'FAIL', network: 'not observed', checks: [], states: [] };
const checks = report.checks as string[], states = report.states as unknown[];
app.whenReady().then(async () => {
  let service: ThemePlaybackService | null = null, window: BrowserWindow | null = null;
  try {
    window = new BrowserWindow({ width: 700, height: 500, show: true, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await window.loadURL('data:text/html,<title>Kitvi official player verification</title><h1>Kitvi official YouTube player verification</h1><p>This temporary window closes after verification.</p>');
    const theme = { pluginId: 'kitvi.player-spike', name: 'Player spike', version: '1.0.0', contentHash: 'a'.repeat(64), definition: { schemaVersion: 1, id: 'spike', name: 'Spike', modes: { light: {}, dark: {} }, bgm: { title: 'YouTube', volume: 15, loop: false, tracks: [{ id: 'official-example', title: 'YouTube API example', source: { type: 'youtube', videoId: process.env.KITVI_PLAYER_SPIKE_VIDEO || 'M7lc1UVf-VE' } }] } } } as ThemeCatalogEntry;
    let child: Electron.WebContentsView | undefined;
    let wrapperIsolation: unknown = null, remoteIsolation: unknown = null;
    const requests: unknown[] = [];
    service = new ThemePlaybackService({ window, canRun: () => true, log: (message) => console.log(message), createYouTubeSurface: async (options) => {
      const surface = await createElectronYouTubeSurface(options);
      child = window!.contentView.children.find((view) => 'webContents' in view) as Electron.WebContentsView | undefined;
      assert(child, 'native WebContentsView exists');
      const preferences = child.webContents.getLastWebPreferences();
      assert.equal(preferences.sandbox, true); assert.equal(preferences.contextIsolation, true); assert.equal(preferences.nodeIntegration, false);
      assert.notEqual(child.webContents.session, window!.webContents.session); assert.equal(child.webContents.session.isPersistent(), false);
      checks.push('native view uses sandbox/context isolation, no Node/plugin API, and a separate ephemeral session');
      child.webContents.session.webRequest.onSendHeaders((details) => {
        const header = (name: string) => Object.entries(details.requestHeaders).find(([key]) => key.toLowerCase() === name)?.[1] ?? null;
        if (details.url.includes('/embed/') || details.url.includes('/iframe_api')) requests.push({ url: new URL(details.url).origin + new URL(details.url).pathname, referer: header('referer'), origin: header('origin') });
      });
      child.webContents.on('dom-ready', () => {
        void child!.webContents.executeJavaScript('({origin:location.origin,node:typeof require,plugin:typeof window.kitvi,bridge:typeof window.kitviPlayerReport})').then((value) => { wrapperIsolation = value; }, () => {});
      });
      child.webContents.on('did-frame-navigate', (_event, url, _code, _status, main) => {
        if (!main && url.startsWith('https://www.youtube.com/embed/')) {
          const frame = child!.webContents.mainFrame.framesInSubtree.find((frame) => frame.url === url);
          if (frame) void frame.executeJavaScript('({node:typeof require,plugin:typeof window.kitvi,bridge:typeof window.kitviPlayerReport})').then((value) => { remoteIsolation = value; }, () => {});
        }
      });
      const blocked = await child.webContents.session.fetch('https://example.com/').then((response) => response.status === 403, () => true);
      assert.equal(blocked, true); checks.push('remote requests outside the YouTube resource allowlist are blocked');
      return surface;
    } });
    service.on('state', (state) => states.push({ phase: state.phase, generation: state.generation, error: state.error }));
    service.setTheme(theme); service.setViewport({ x: 20, y: 120, width: 480, height: 270, visible: true });
    const playing = service.playTrack('official-example');
    await playing;
    await wait(5000);
    report.network = { officialIframeObserved: !!remoteIsolation, phase: service.state.phase, error: service.state.error, observedPlaying: states.some((state: any) => state.phase === 'playing'), requests, wrapperIsolation, remoteIsolation };
    assert.deepEqual(wrapperIsolation, { origin: YOUTUBE_APP_ORIGIN, node: 'undefined', plugin: 'undefined', bridge: 'function' });
    if (remoteIsolation) {
      assert.deepEqual(remoteIsolation, { node: 'undefined', plugin: 'undefined', bridge: 'undefined' });
      checks.push('official YouTube iframe receives neither Node, plugin API nor the wrapper report bridge');
    }
    if (service.state.phase === 'playing' || service.state.phase === 'loading') {
      window.minimize(); await wait(200); assert.equal(service.state.phase, 'paused');
      window.restore(); await wait(200); assert.equal(service.state.phase, 'paused');
      checks.push('minimize pauses and restore does not restart transport');
    }
    service.setTheme(null); assert.equal(service.state.phase, 'idle');
    await wait(200); assert(!child?.webContents || child.webContents.isDestroyed());
    checks.push('theme revocation closes the native player and invalidates its playback generation');
    service.dispose(); report.mechanics = 'PASS';
    report.playback = (report.network as { observedPlaying: boolean }).observedPlaying ? 'PASS' : 'FAIL';
  } catch (error) { report.error = error instanceof Error ? error.stack : String(error); }
  finally {
    service?.dispose(); if (window && !window.isDestroyed()) window.destroy();
    writeFileSync(join(directory, 'report.json'), JSON.stringify(report, null, 2));
    app.exit(report.mechanics === 'PASS' && report.playback === 'PASS' ? 0 : 1);
  }
});
