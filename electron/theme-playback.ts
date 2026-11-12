import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { BrowserWindow, WebContentsView } from 'electron';
import type { ThemeCatalogEntry, ThemeTrack } from '../shared/themes.ts';
import type { LocalPlaybackReport, PlaybackState, PlaybackViewport } from '../shared/playback.ts';

export const YOUTUBE_APP_ORIGIN = 'https://com.popop098.kitvi';
export const MANUAL_YOUTUBE_TRACK_ID = '__youtube_url__';
const PLAYER_PATH = '/player.html';
const validVideoId = /^[a-zA-Z0-9_-]{11}$/;
const phases = new Set(['idle', 'loading', 'playing', 'paused', 'error']);
const YOUTUBE_PROVIDER_DOMAINS = ['youtube.com', 'youtube-nocookie.com', 'ytimg.com', 'googlevideo.com', 'ggpht.com', 'google.com', 'googleapis.com', 'gstatic.com', 'googleusercontent.com', 'doubleclick.net'] as const;

/** Includes the official player's nested consent, internal and advertising frames. */
export function isAllowedYouTubeResource(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && YOUTUBE_PROVIDER_DOMAINS.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
  } catch { return false; }
}
export function isAllowedYouTubeFrameNavigation(url: string, isMainFrame: boolean): boolean {
  return !isMainFrame && isAllowedYouTubeResource(url);
}

export function parseYouTubeVideoId(input: unknown): string {
  if (typeof input !== 'string' || input.length > 2048) throw new Error('YouTube 동영상 URL을 확인해 주세요.');
  const value = input.trim();
  if (validVideoId.test(value)) return value;
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('YouTube 동영상 URL을 확인해 주세요.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('공개 HTTPS YouTube 동영상 URL만 사용할 수 있어요.');
  let id: string | null = null;
  if (url.hostname === 'youtu.be' && /^\/[a-zA-Z0-9_-]{11}\/?$/.test(url.pathname)) id = url.pathname.split('/')[1];
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else if (/^\/(shorts|embed)\/[a-zA-Z0-9_-]{11}\/?$/.test(url.pathname)) id = url.pathname.split('/')[2];
  }
  if (!id || !validVideoId.test(id)) throw new Error('재생목록이 아닌 YouTube 동영상 URL을 입력해 주세요.');
  return id;
}

export function validatePlaybackViewport(value: unknown, content: { width: number; height: number }): PlaybackViewport | null {
  if (!value || typeof value !== 'object') return null;
  const b = value as PlaybackViewport;
  if (b.visible !== true || ![b.x, b.y, b.width, b.height].every(Number.isFinite)) return null;
  // Round inward: a fractional viewport must not become larger than its visible slot.
  const x = Math.ceil(b.x), y = Math.ceil(b.y), width = Math.floor(b.x + b.width) - x, height = Math.floor(b.y + b.height) - y;
  if (x < 0 || y < 58 || width < 200 || height < 200 || x + width > content.width || y + height > content.height) return null;
  return { x, y, width, height, visible: true };
}

export function youtubeErrorMessage(code: unknown): string {
  switch (code) {
    case 0: return 'YouTube 플레이어를 불러오지 못했어요. 네트워크 연결을 확인해 주세요. (0)';
    case 2: return 'YouTube 동영상 ID가 올바르지 않아요. (2)';
    case 5: return 'YouTube HTML5 플레이어에서 재생할 수 없어요. (5)';
    case 100: return 'YouTube 동영상이 삭제되었거나 비공개 상태예요. (100)';
    case 101: case 150: return `이 YouTube 동영상은 외부 플레이어 재생이 허용되지 않아요. (${code})`;
    case 153: return 'YouTube가 앱 식별 정보를 확인하지 못했어요. 앱 업데이트 후 다시 시도해 주세요. (153)';
    default: return 'YouTube 동영상을 재생할 수 없어요. 다른 동영상을 선택해 주세요.';
  }
}

/** Electron's intercepted HTTPS forwarding can omit the renderer's Referer. */
export function youtubeRequestHeaders(url: string, headers: Record<string, string>): Record<string, string> {
  if (!/^https:\/\/www\.youtube(?:-nocookie)?\.com\/embed\/[a-zA-Z0-9_-]{11}(?:\?|$)/.test(url)) return headers;
  return { ...Object.fromEntries(Object.entries(headers).filter(([key]) => key.toLowerCase() !== 'referer')), Referer: `${YOUTUBE_APP_ORIGIN}/` };
}

interface PlayerConfiguration { generation: number; videoId: string; volume: number; loop: boolean; position: number }
export interface YouTubeSurface {
  load(config: PlayerConfiguration): Promise<void>;
  play(): void;
  pause(): void;
  configure(config: { volume: number; loop: boolean }): void;
  setViewport(viewport: PlaybackViewport | null): void;
  dispose(): void;
}
interface SurfaceOptions { window: BrowserWindow; report: (value: LocalPlaybackReport) => void; log: (message: string) => void }
export interface ThemePlaybackOptions {
  window: BrowserWindow;
  getActiveTheme?: () => ThemeCatalogEntry | null;
  canRun: (id: string) => boolean;
  log?: (message: string) => void;
  createYouTubeSurface?: (options: SurfaceOptions) => Promise<YouTubeSurface>;
}

/** Transport ownership remains in the host. Every continuation is bound to an artifact and generation. */
export class ThemePlaybackService extends EventEmitter {
  private options: ThemePlaybackOptions;
  private active: ThemeCatalogEntry | null = null;
  private surface: YouTubeSurface | null = null;
  private youtubeAuthorized = false;
  private viewport: PlaybackViewport | null = null;
  private manualTrack: ThemeTrack | null = null;
  private stopped = false;
  private removeWindowListeners: Array<() => void> = [];
  private value: PlaybackState = { themeId: null, trackId: null, requestedTrackId: null, provider: null, phase: 'idle', volume: 50, loop: false, position: 0, duration: null, error: null, generation: 0, assetUrl: null };

  constructor(options: ThemePlaybackOptions) {
    super(); this.options = options;
    const hide = () => { if (this.value.provider === 'youtube') this.pause(); };
    const resize = () => { if (this.viewport) this.setViewport(this.viewport); };
    const closed = () => this.dispose();
    options.window.on('hide', hide); options.window.on('minimize', hide); options.window.on('resize', resize); options.window.on('closed', closed);
    this.removeWindowListeners = [() => options.window.removeListener('hide', hide), () => options.window.removeListener('minimize', hide), () => options.window.removeListener('resize', resize), () => options.window.removeListener('closed', closed)];
    if (options.getActiveTheme) this.setTheme(options.getActiveTheme());
  }
  get state(): PlaybackState { this.refresh(); return { ...this.value }; }
  private emitState(): PlaybackState { const state = { ...this.value }; this.emit('state', state); return state; }
  private runnable(theme: ThemeCatalogEntry | null): theme is ThemeCatalogEntry {
    if (!theme || this.stopped) return false;
    try { return this.options.canRun(theme.pluginId); } catch { return false; }
  }
  private identity(theme: ThemeCatalogEntry | null) { return theme ? `${theme.pluginId}:${theme.version}:${theme.contentHash}` : null; }
  private refresh() {
    if (this.stopped) return;
    const current = this.options.getActiveTheme?.();
    if (current !== undefined && this.identity(current) !== this.identity(this.active)) this.setTheme(current);
    else if (this.active && !this.runnable(this.active)) this.setTheme(null);
  }
  private requireTheme(): ThemeCatalogEntry {
    if (this.stopped) throw new Error('플레이어가 종료되었어요.');
    this.refresh();
    if (!this.runnable(this.active)) throw new Error('재생 권한이 있는 활성 테마가 필요해요.');
    return this.active;
  }
  private current(generation: number, identity: string | null) {
    this.refresh(); return !this.stopped && generation === this.value.generation && identity === this.identity(this.active) && this.runnable(this.active);
  }
  private detachSurface() {
    this.youtubeAuthorized = false;
    const previous = this.surface; this.surface = null;
    if (previous) { previous.pause(); previous.setViewport(null); previous.dispose(); }
  }
  setTheme(theme: ThemeCatalogEntry | null): PlaybackState {
    if (this.stopped) return { ...this.value };
    if (theme && !this.runnable(theme)) theme = null;
    if (this.identity(theme) === this.identity(this.active)) return { ...this.value };
    this.detachSurface(); this.active = theme; this.manualTrack = null;
    this.value = { ...this.value, themeId: theme?.pluginId ?? null, trackId: null, requestedTrackId: null, provider: null, phase: 'idle', position: 0, duration: null, error: null, generation: this.value.generation + 1, assetUrl: null, volume: theme?.definition.bgm?.volume ?? 50, loop: theme?.definition.bgm?.loop ?? false };
    return this.emitState();
  }
  requestTrack(id: unknown): PlaybackState {
    const theme = this.requireTheme();
    if (typeof id !== 'string' || !theme.definition.bgm?.tracks.some((track) => track.id === id)) throw new Error('테마에서 제공하는 트랙을 선택해 주세요.');
    this.value.requestedTrackId = id; return this.emitState();
  }
  async playTrack(id: unknown): Promise<PlaybackState> {
    const theme = this.requireTheme();
    const track = typeof id === 'string' ? (id === MANUAL_YOUTUBE_TRACK_ID ? this.manualTrack : theme.definition.bgm?.tracks.find((item) => item.id === id)) : null;
    if (!track) throw new Error('재생할 트랙을 선택해 주세요.');
    if (track.source.type === 'youtube' && !this.visibleViewport()) throw new Error('YouTube 플레이어가 200 × 200 이상으로 완전히 표시되어야 재생할 수 있어요.');
    const position = this.value.trackId === id && this.value.phase === 'paused' ? this.value.position : 0;
    this.detachSurface();
    const generation = this.value.generation + 1, identity = this.identity(theme);
    this.value = { ...this.value, themeId: theme.pluginId, trackId: track.id, requestedTrackId: null, provider: track.source.type, phase: 'loading', position, duration: null, error: null, generation, assetUrl: track.source.type === 'asset' ? `kitvi-plugin://${theme.pluginId}/${track.source.path.split('/').map(encodeURIComponent).join('/')}?v=${encodeURIComponent(theme.contentHash)}` : null };
    this.emitState();
    if (track.source.type === 'asset') return { ...this.value };
    let created: YouTubeSurface | null = null;
    try {
      created = await (this.options.createYouTubeSurface ?? createElectronYouTubeSurface)({ window: this.options.window, log: this.options.log ?? (() => {}), report: (value) => this.report(value, 'youtube') });
      if (!this.current(generation, identity) || this.value.phase !== 'loading' || !this.visibleViewport()) { created.dispose(); return { ...this.value }; }
      this.surface = created; this.youtubeAuthorized = true; created.setViewport(this.visibleViewport());
      await created.load({ generation, videoId: track.source.videoId, volume: this.value.volume, loop: this.value.loop, position });
      if (!this.current(generation, identity) || this.value.phase !== 'loading' || !this.visibleViewport()) { if (this.surface === created) this.detachSurface(); return { ...this.value }; }
      created.play();
    } catch (error) {
      if (this.surface === created) this.detachSurface(); else created?.dispose();
      if (this.current(generation, identity) && this.value.phase !== 'error') { this.value.phase = 'error'; this.value.error = error instanceof Error ? error.message.slice(0, 240) : youtubeErrorMessage(0); this.emitState(); }
    }
    return { ...this.value };
  }
  pause(): PlaybackState {
    this.refresh();
    this.youtubeAuthorized = false;
    if (this.value.phase === 'playing' || this.value.phase === 'loading') { this.value.phase = 'paused'; this.value.generation++; }
    this.surface?.pause(); this.surface?.setViewport(null);
    return this.emitState();
  }
  setVolume(value: unknown): PlaybackState {
    this.requireTheme();
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) throw new Error('볼륨은 0부터 100 사이여야 해요.');
    this.value.volume = value; this.surface?.configure({ volume: value, loop: this.value.loop }); return this.emitState();
  }
  setLoop(value: unknown): PlaybackState {
    this.requireTheme(); if (typeof value !== 'boolean') throw new Error('반복 재생 설정이 올바르지 않아요.');
    this.value.loop = value; this.surface?.configure({ volume: this.value.volume, loop: value }); return this.emitState();
  }
  setYouTubeSource(url: unknown): PlaybackState {
    this.requireTheme(); const videoId = parseYouTubeVideoId(url); this.detachSurface();
    this.manualTrack = { id: MANUAL_YOUTUBE_TRACK_ID, title: 'YouTube', source: { type: 'youtube', videoId } };
    this.value = { ...this.value, trackId: MANUAL_YOUTUBE_TRACK_ID, requestedTrackId: null, provider: 'youtube', phase: 'paused', position: 0, duration: null, error: null, generation: this.value.generation + 1, assetUrl: null };
    return this.emitState();
  }
  private visibleViewport() {
    const window = this.options.window;
    if (window.isDestroyed() || window.isMinimized() || !window.isVisible()) return null;
    return validatePlaybackViewport(this.viewport, window.getContentBounds());
  }
  setViewport(value: unknown): PlaybackState {
    if (this.stopped) return { ...this.value };
    this.viewport = validatePlaybackViewport(value, this.options.window.getContentBounds());
    const valid = this.visibleViewport();
    if (this.value.provider === 'youtube' && !valid) this.pause();
    else this.surface?.setViewport(this.youtubeAuthorized ? valid : null);
    return { ...this.value };
  }
  reportLocal(value: unknown): PlaybackState { this.report(value, 'asset'); return { ...this.value }; }
  private report(value: unknown, provider: 'asset' | 'youtube') {
    this.refresh();
    if (!value || typeof value !== 'object' || this.stopped || this.value.provider !== provider || !this.runnable(this.active)) return;
    const update = value as LocalPlaybackReport;
    if (update.generation !== this.value.generation || !phases.has(update.phase) || !Number.isFinite(update.position) || update.position < 0 || (update.duration !== null && (!Number.isFinite(update.duration) || update.duration < 0))) return;
    if (this.value.phase !== 'loading' && this.value.phase !== 'playing' && !(provider === 'youtube' && this.youtubeAuthorized && (this.value.phase === 'paused' || this.value.phase === 'idle'))) return;
    if (provider === 'youtube' && !this.visibleViewport()) { this.pause(); return; }
    this.value = { ...this.value, phase: update.phase, position: update.position, duration: update.duration, error: update.phase === 'error' || (update.phase === 'paused' && update.error) ? String(update.error || '재생 중 오류가 발생했어요.').slice(0, 240) : null };
    if (update.phase === 'error') this.detachSurface();
    this.emitState();
  }
  dispose() {
    if (this.stopped) return;
    this.detachSurface(); this.stopped = true; this.active = null; this.manualTrack = null;
    for (const remove of this.removeWindowListeners) remove();
    this.removeWindowListeners = [];
    this.value = { ...this.value, themeId: null, trackId: null, requestedTrackId: null, provider: null, phase: 'idle', position: 0, duration: null, error: null, generation: this.value.generation + 1, assetUrl: null };
    this.emitState();
  }
}

// Remote resources stay in a dedicated, nonpersistent session. The real installed
// application identity is the wrapper origin and the scoped embed Referer.
export async function createElectronYouTubeSurface({ window, report, log }: SurfaceOptions): Promise<YouTubeSurface> {
  if (window.isDestroyed()) throw new Error('플레이어가 종료되었어요.');
  const { session, WebContentsView: View } = await import('electron');
  if (window.isDestroyed()) throw new Error('플레이어가 종료되었어요.');
  const isolated = session.fromPartition(`kitvi-youtube-${randomUUID()}`, { cache: false });
  isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  isolated.setPermissionCheckHandler(() => false);
  isolated.webRequest.onBeforeSendHeaders((details, callback) => callback({ requestHeaders: youtubeRequestHeaders(details.url, details.requestHeaders) }));
  let configuration: PlayerConfiguration | null = null, disposed = false;
  let ready: { resolve: () => void; reject: (error: Error) => void; timer: NodeJS.Timeout } | null = null;
  isolated.protocol.handle('https', async (request) => {
    const url = new URL(request.url);
    if (url.origin === YOUTUBE_APP_ORIGIN) {
      if (url.pathname !== PLAYER_PATH || !configuration || url.searchParams.get('generation') !== String(configuration.generation)) return new Response('Not found', { status: 404 });
      return new Response(renderPlayerHtml(configuration), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Content-Security-Policy': "default-src 'none'; script-src 'nonce-kitvi-player' https://www.youtube.com https://s.ytimg.com; style-src 'unsafe-inline'; frame-src https://www.youtube.com https://www.youtube-nocookie.com; connect-src https://www.youtube.com; img-src https://i.ytimg.com; base-uri 'none'; form-action 'none'" } });
    }
    if (!isAllowedYouTubeResource(request.url)) return new Response('Forbidden', { status: 403 });
    return isolated.fetch(request, { bypassCustomProtocolHandlers: true });
  });
  isolated.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !details.url.startsWith(`${YOUTUBE_APP_ORIGIN}${PLAYER_PATH}?`) && !isAllowedYouTubeResource(details.url) }));
  isolated.on('will-download', (event) => event.preventDefault());
  const view: WebContentsView = new View({ webPreferences: { session: isolated, sandbox: true, contextIsolation: true, nodeIntegration: false, nodeIntegrationInSubFrames: false, webSecurity: true, allowRunningInsecureContent: false, webviewTag: false, preload: join(__dirname, 'player-preload.cjs'), autoplayPolicy: 'no-user-gesture-required', devTools: false } });
  view.setVisible(false); window.contentView.addChildView(view);
  view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  view.webContents.on('will-navigate', (event) => event.preventDefault());
  view.webContents.on('will-frame-navigate', (event) => { if (!isAllowedYouTubeFrameNavigation(event.url, event.isMainFrame)) event.preventDefault(); });
  view.webContents.on('will-attach-webview', (event) => event.preventDefault());
  view.webContents.on('ipc-message', (event, channel, ...args) => {
    if (disposed || channel !== 'kitvi:player-report' || event.senderFrame !== view.webContents.mainFrame || !event.senderFrame?.url.startsWith(`${YOUTUBE_APP_ORIGIN}${PLAYER_PATH}?`)) return;
    const value = args[0];
    if (!value || typeof value !== 'object' || value.generation !== configuration?.generation) return;
    if (value.kind === 'ready') { if (ready) { clearTimeout(ready.timer); ready.resolve(); ready = null; } return; }
    report(value);
  });
  view.webContents.on('render-process-gone', () => { if (configuration && !disposed) report({ generation: configuration.generation, phase: 'error', position: 0, duration: null, error: youtubeErrorMessage(0) }); });
  const command = (value: Record<string, unknown>, gesture = false) => {
    if (disposed || view.webContents.isDestroyed()) return;
    void view.webContents.executeJavaScript(`window.__kitviPlayerCommand?.(${JSON.stringify(value)})`, gesture).catch(() => { if (!disposed) log('YouTube player command failed'); });
  };
  return {
    async load(config) {
      configuration = config;
      const loaded = new Promise<void>((resolve, reject) => { ready = { resolve, reject, timer: setTimeout(() => { ready = null; reject(new Error(youtubeErrorMessage(0))); }, 20000) }; });
      await Promise.all([view.webContents.loadURL(`${YOUTUBE_APP_ORIGIN}${PLAYER_PATH}?generation=${config.generation}`), loaded]);
    },
    play: () => { if (!disposed) view.webContents.setAudioMuted(false); command({ type: 'play' }, true); },
    pause: () => { if (!disposed) view.webContents.setAudioMuted(true); command({ type: 'pause' }); },
    configure: (config) => { if (configuration) configuration = { ...configuration, ...config }; command({ type: 'configure', ...config }); },
    setViewport: (bounds) => { if (disposed) return; if (bounds) view.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }); view.setVisible(!!bounds); },
    dispose: () => {
      if (disposed) return; disposed = true;
      if (ready) { clearTimeout(ready.timer); ready.reject(new Error('플레이어가 종료되었어요.')); ready = null; }
      view.setVisible(false);
      if (!window.isDestroyed()) window.contentView.removeChildView(view);
      if (!view.webContents.isDestroyed()) view.webContents.close({ waitForBeforeUnload: false });
      isolated.protocol.unhandle('https'); isolated.webRequest.onBeforeRequest(null); isolated.webRequest.onBeforeSendHeaders(null);
      void isolated.clearStorageData().catch(() => {});
    },
  };
}

function renderPlayerHtml(config: PlayerConfiguration): string {
  const settings = JSON.stringify(config).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="strict-origin-when-cross-origin"><meta name="viewport" content="width=device-width,initial-scale=1"><title>YouTube · Kitvi</title><style>html,body,#player{width:100%;height:100%;margin:0;background:#000;overflow:hidden}iframe{display:block;border:0}</style></head><body><div id="player"></div><script nonce="kitvi-player">
  const config=${settings}; let player=null, permitted=false;
  const send=(value)=>window.kitviPlayerReport?.({generation:config.generation,...value});
  const status=(phase,error)=>send({phase,position:Number(player?.getCurrentTime?.())||0,duration:Number(player?.getDuration?.())||null,error:error||null});
  window.__kitviPlayerCommand=(command)=>{if(!player)return;if(command.type==='play'){permitted=true;player.setVolume(config.volume);if(config.position>0)player.seekTo(config.position,true);player.playVideo();}else if(command.type==='pause'){permitted=false;player.pauseVideo();}else if(command.type==='configure'){config.volume=command.volume;config.loop=command.loop;player.setVolume(config.volume);}};
  window.onYouTubeIframeAPIReady=()=>{player=new YT.Player('player',{width:'100%',height:'100%',videoId:config.videoId,playerVars:{autoplay:0,controls:1,fs:0,playsinline:1,origin:'${YOUTUBE_APP_ORIGIN}',widget_referrer:'${YOUTUBE_APP_ORIGIN}'},events:{onReady:()=>{player.setVolume(config.volume);send({kind:'ready'});},onStateChange:(event)=>{if(event.data===1){if(!permitted){player.pauseVideo();return;}status('playing');}else if(event.data===2&&permitted)status('paused');else if(event.data===3&&permitted)status('loading');else if(event.data===0){if(config.loop&&permitted){player.seekTo(0,true);player.playVideo();}else status('idle');}},onError:(event)=>status('error',({0:'YouTube 플레이어를 불러오지 못했어요. (0)',2:'YouTube 동영상 ID가 올바르지 않아요. (2)',5:'YouTube HTML5 재생 오류예요. (5)',100:'YouTube 동영상이 삭제되었거나 비공개 상태예요. (100)',101:'YouTube 외부 재생이 허용되지 않아요. (101)',150:'YouTube 외부 재생이 허용되지 않아요. (150)',153:'YouTube가 앱 식별 정보를 확인하지 못했어요. (153)'})[event.data]||'YouTube 동영상을 재생할 수 없어요.'),onAutoplayBlocked:()=>status('paused','YouTube 자동 재생이 차단되었어요. 표시된 YouTube 플레이어의 재생 버튼을 눌러 주세요.')}});};
  setInterval(()=>{if(permitted&&player?.getPlayerState?.()===1)status('playing');},1000);
  </script><script nonce="kitvi-player" src="https://www.youtube.com/iframe_api"></script></body></html>`;
}
