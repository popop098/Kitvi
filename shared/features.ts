export type UpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error' | 'disabled';
export interface UpdateState {
  phase: UpdatePhase; currentVersion: string; availableVersion: string | null; autoCheck: boolean;
  checkedAt: string | null; progress: number | null; message: string | null; canInstall: boolean; releaseUrl: string;
}
export type PluginPermission = 'storage' | 'downloads' | 'media';
export interface PluginManifest {
  apiVersion: 1; id: string; name: string; version: string; minKitviVersion: string;
  description: string; author: string; authorEmail?: string; entry: string; permissions: PluginPermission[];
}
export interface InstalledPlugin extends PluginManifest { enabled: boolean; source: string; installedAt: string; contentHash: string; needsConsent: boolean }
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
