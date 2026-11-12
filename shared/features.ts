export type UpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error' | 'disabled';
export interface UpdateState {
  phase: UpdatePhase; currentVersion: string; availableVersion: string | null; autoCheck: boolean;
  checkedAt: string | null; progress: number | null; message: string | null; canInstall: boolean; releaseUrl: string;
}
import type { ThemeState } from './themes.ts';
import type { PlaybackState, PlaybackViewport, LocalPlaybackReport } from './playback.ts';
export type PluginPermission = 'storage' | 'downloads' | 'media' | 'theme' | 'playback';
interface PluginManifestBase {
  id: string; name: string; version: string; minKitviVersion: string;
  description: string; author: string; authorEmail?: string; permissions: PluginPermission[];
}
export type PluginManifest = PluginManifestBase & ({ apiVersion: 1; entry: string; kind?: never; theme?: never } | { apiVersion: 2; kind: 'theme'; theme: string; entry?: string });
export type InstalledPlugin = PluginManifest & { enabled: boolean; source: string; installedAt: string; contentHash: string; needsConsent: boolean };
export interface PluginPreview { token: string; manifest: PluginManifest; source: string; permissions: PluginPermission[] }
export interface PluginState { system: { enabled: boolean; acceptedAt: string | null }; plugins: InstalledPlugin[]; busy: boolean; message: string | null }
export type PluginUpdateStatus = 'idle' | 'checking' | 'current' | 'available' | 'unsupported' | 'error';
export interface PluginUpdateInfo {
  id: string; status: PluginUpdateStatus; currentVersion: string; availableVersion: string | null;
  checkedAt: string | null; message: string | null;
}
export interface PluginUpdatesState { autoCheck: boolean; checking: boolean; checkedAt: string | null; plugins: PluginUpdateInfo[] }
export type PluginUpdateApplyResult = { kind: 'applied'; state: PluginState } | { kind: 'review'; preview: PluginPreview };
export interface MediaInfo { id: string; title: string; duration: number | null; uploader: string | null; thumbnail: string | null }
export type MediaMode = 'video' | 'audio';
export interface MediaJob {
  id: string; pluginId: string; title: string; url: string; mode: MediaMode;
  phase: 'queued' | 'running' | 'completed' | 'cancelled' | 'error'; progress: number | null;
  downloadedBytes: number; totalBytes: number | null; speed: number | null; eta: number | null;
  filename: string | null; error: string | null; startedAt: string;
}
export interface MediaState {
  engine: { phase: 'missing' | 'installing' | 'ready' | 'error'; version: string | null; progress: number | null; message: string | null };
  jobs: MediaJob[]; folder: string | null;
}
export interface FeatureApi {
  getPlaybackState(): Promise<PlaybackState>;
  playThemeTrack(trackId: string): Promise<PlaybackState>;
  pauseThemePlayback(): Promise<PlaybackState>;
  setThemePlaybackVolume(volume: number): Promise<PlaybackState>;
  setThemePlaybackLoop(loop: boolean): Promise<PlaybackState>;
  setYouTubeSource(url: string): Promise<PlaybackState>;
  setPlaybackViewport(viewport: PlaybackViewport): Promise<void>;
  reportLocalPlayback(report: LocalPlaybackReport): Promise<PlaybackState>;
  onPlayback(listener: (state: PlaybackState) => void): () => void;
  getThemeState(): Promise<ThemeState>;
  previewTheme(id: string | null): Promise<ThemeState>;
  applyTheme(id: string | null): Promise<ThemeState>;
  cancelThemePreview(): Promise<ThemeState>;
  onTheme(listener: (state: ThemeState) => void): () => void;
  getUpdateState(): Promise<UpdateState>;
  checkUpdates(): Promise<UpdateState>;
  setAutoCheck(value: boolean): Promise<UpdateState>;
  downloadUpdate(): Promise<UpdateState>;
  installUpdate(): Promise<void>;
  openReleasePage(): Promise<void>;
  onUpdate(listener: (state: UpdateState) => void): () => void;
  getPlugins(): Promise<PluginState>;
  previewPlugin(repository: string): Promise<PluginPreview>;
  previewLocalPlugin(): Promise<PluginPreview | null>;
  confirmPlugin(token: string): Promise<PluginState>;
  setPluginSystemEnabled(enabled: boolean, acceptNotice?: boolean): Promise<PluginState>;
  acceptPlugin(id: string, contentHash: string): Promise<PluginState>;
  setPluginEnabled(id: string, enabled: boolean): Promise<PluginState>;
  removePlugin(id: string): Promise<PluginState>;
  onPlugins(listener: (state: PluginState) => void): () => void;
  getPluginUpdates(): Promise<PluginUpdatesState>;
  checkPluginUpdates(): Promise<PluginUpdatesState>;
  setPluginAutoCheck(value: boolean): Promise<PluginUpdatesState>;
  applyPluginUpdate(id: string): Promise<PluginUpdateApplyResult>;
  onPluginUpdates(listener: (state: PluginUpdatesState) => void): () => void;
  invokePlugin(id: string, method: string, params: unknown): Promise<unknown>;
  getPluginMedia(id: string): Promise<MediaState>;
  onMedia(listener: (state: MediaState) => void): () => void;
}
