import type { ThemeDefinition } from './types/themes';
import type { PlaybackState } from './types/playback';
export type Appearance = 'light' | 'dark';
export interface PluginThemeState { active: boolean; selected: boolean; definition: ThemeDefinition; appearance: Appearance }
export interface KitviPluginSdk {
  request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
  theme: { getState(): Promise<PluginThemeState> };
  playback: {
    getState(): Promise<PlaybackState>;
    /** Requests a selection in trusted host controls; never starts automatically. */
    requestTrack(trackId: string): Promise<PlaybackState>;
    pause(): Promise<PlaybackState>;
    setVolume(volume: number): Promise<PlaybackState>;
  };
  onState(listener: (state: { appearance: Appearance; plugin: { id: string; name: string; version: string }; media: unknown }) => void): () => void;
  ready(): void;
}
declare global { interface Window { kitviPlugin: KitviPluginSdk } }
