export type PlaybackProvider = 'asset' | 'youtube';
export type PlaybackPhase = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
export interface PlaybackState {
  themeId: string | null;
  trackId: string | null;
  requestedTrackId: string | null;
  provider: PlaybackProvider | null;
  phase: PlaybackPhase;
  volume: number;
  loop: boolean;
  position: number;
  duration: number | null;
  error: string | null;
  generation: number;
  assetUrl: string | null;
}
export interface LocalPlaybackReport {
  generation: number;
  phase: PlaybackPhase;
  position: number;
  duration: number | null;
  error?: string | null;
}
/** CSS pixels relative to the BrowserWindow content area, including its custom header. */
export interface PlaybackViewport { x: number; y: number; width: number; height: number; visible: boolean }
