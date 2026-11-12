import { validateArchivePath, validatePluginId } from './plugin-schema.ts';
import { THEME_COLOR_KEYS, THEME_SECTION_IDS } from './themes.ts';
import type { ThemeDefinition, ThemeSectionId, ThemeTrack } from './themes.ts';

function object(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !keys.includes(key))) throw new Error(`Invalid theme ${label}; unknown fields are not allowed.`);
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\p{Cc}]/u.test(value)) throw new Error(`Invalid theme ${label}.`);
  return value;
}
function number(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`Invalid theme ${label}.`);
  return value;
}
function asset(value: unknown, kind: 'font' | 'image' | 'audio'): string {
  const name = validateArchivePath(value);
  const accepted = kind === 'font' ? /\.(?:woff2?|ttf|otf)$/i : kind === 'image' ? /\.(?:png|jpe?g|gif|webp)$/i : /\.(?:mp3|ogg|wav|m4a)$/i;
  if (!accepted.test(name)) throw new Error(`Unsupported theme ${kind} asset.`);
  return name;
}
function sections(value: unknown, label: string): ThemeSectionId[] {
  if (!Array.isArray(value) || value.length > THEME_SECTION_IDS.length || new Set(value).size !== value.length || value.some((id) => !THEME_SECTION_IDS.includes(id))) throw new Error(`Invalid theme ${label}.`);
  return [...value];
}
function colors(value: unknown): ThemeDefinition['modes']['light'] {
  const raw = object(value, THEME_COLOR_KEYS, 'colors');
  if (THEME_COLOR_KEYS.some((key) => typeof raw[key] !== 'string' || !/^#[a-fA-F0-9]{6}(?:[a-fA-F0-9]{2})?$/.test(raw[key] as string))) throw new Error('Theme colors must contain every semantic token as #RRGGBB or #RRGGBBAA.');
  return Object.fromEntries(THEME_COLOR_KEYS.map((key) => [key, raw[key]])) as ThemeDefinition['modes']['light'];
}

/** A closed declarative schema: no CSS, URLs, script hooks or host shell overrides. */
export function validateThemeDefinition(value: unknown): ThemeDefinition {
  const raw = object(value, ['schemaVersion', 'id', 'name', 'modes', 'typography', 'shape', 'background', 'layout', 'bgm'], 'definition');
  if (raw.schemaVersion !== 1) throw new Error('Unsupported theme schema version.');
  const modes = object(raw.modes, ['light', 'dark'], 'modes');
  const result: ThemeDefinition = { schemaVersion: 1, id: validatePluginId(raw.id), name: text(raw.name, 80, 'name'), modes: { light: colors(modes.light), dark: colors(modes.dark) } };
  if (raw.typography !== undefined) {
    const item = object(raw.typography, ['fontFamily', 'fontAsset', 'baseSize'], 'typography');
    if (!['pretendard', 'system', 'custom'].includes(item.fontFamily as string)) throw new Error('Invalid theme font family.');
    if (item.fontFamily !== 'custom' && item.fontAsset !== undefined) throw new Error('A font asset requires the custom font family.');
    result.typography = { fontFamily: item.fontFamily as 'pretendard' | 'system' | 'custom', ...(item.fontFamily === 'custom' ? { fontAsset: asset(item.fontAsset, 'font') } : {}), ...(item.baseSize !== undefined ? { baseSize: number(item.baseSize, 14, 20, 'base size') } : {}) };
  }
  if (raw.shape !== undefined) {
    const item = object(raw.shape, ['radius', 'spacing'], 'shape');
    result.shape = { ...(item.radius !== undefined ? { radius: number(item.radius, 0, 20, 'radius') } : {}), ...(item.spacing !== undefined ? { spacing: number(item.spacing, 0.8, 1.3, 'spacing') } : {}) };
  }
  if (raw.background !== undefined) {
    const item = object(raw.background, ['asset', 'opacity', 'fit'], 'background');
    if (item.fit !== 'cover' && item.fit !== 'contain') throw new Error('Invalid theme background fit.');
    result.background = { asset: asset(item.asset, 'image'), opacity: number(item.opacity, 0, 1, 'background opacity'), fit: item.fit };
  }
  if (raw.layout !== undefined) {
    const item = object(raw.layout, ['order', 'hidden', 'columns'], 'layout');
    if (![1, 2, 3].includes(item.columns as number)) throw new Error('Invalid theme column count.');
    const hidden = sections(item.hidden, 'hidden sections');
    if (hidden.includes('summary') || hidden.includes('performance')) throw new Error('Required dashboard sections cannot be hidden.');
    result.layout = { order: sections(item.order, 'section order'), hidden, columns: item.columns as 1 | 2 | 3 };
  }
  if (raw.bgm !== undefined) {
    const item = object(raw.bgm, ['title', 'tracks', 'volume', 'loop'], 'BGM');
    if (!Array.isArray(item.tracks) || item.tracks.length < 1 || item.tracks.length > 32 || typeof item.loop !== 'boolean') throw new Error('Invalid theme tracks or loop control.');
    const ids = new Set<string>();
    const tracks: ThemeTrack[] = item.tracks.map((value) => {
      const track = object(value, ['id', 'title', 'source'], 'track');
      if (typeof track.id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(track.id) || ids.has(track.id)) throw new Error('Invalid or duplicate theme track ID.');
      ids.add(track.id);
      const source = object(track.source, ['type', 'path', 'videoId'], 'track source');
      if (source.type === 'asset' && source.videoId === undefined) return { id: track.id, title: text(track.title, 120, 'track title'), source: { type: 'asset', path: asset(source.path, 'audio') } };
      if (source.type === 'youtube' && source.path === undefined && typeof source.videoId === 'string' && /^[A-Za-z0-9_-]{11}$/.test(source.videoId)) return { id: track.id, title: text(track.title, 120, 'track title'), source: { type: 'youtube', videoId: source.videoId } };
      throw new Error('Invalid theme track source; only local audio or a YouTube video ID is supported.');
    });
    result.bgm = { title: text(item.title, 80, 'BGM title'), tracks, loop: item.loop, volume: number(item.volume, 0, 100, 'BGM volume') };
  }
  return result;
}
export function themeResourceReferences(theme: ThemeDefinition): { path: string; kind: 'font' | 'image' | 'audio' }[] {
  return [
    ...(theme.typography?.fontAsset ? [{ path: theme.typography.fontAsset, kind: 'font' as const }] : []),
    ...(theme.background ? [{ path: theme.background.asset, kind: 'image' as const }] : []),
    ...(theme.bgm?.tracks.flatMap((track) => track.source.type === 'asset' ? [{ path: track.source.path, kind: 'audio' as const }] : []) ?? []),
  ];
}
