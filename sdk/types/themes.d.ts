export declare const THEME_SECTION_IDS: readonly ['summary', 'performance', 'storage', 'displays', 'devices', 'bgm'];
export type ThemeSectionId = typeof THEME_SECTION_IDS[number];
export declare const THEME_COLOR_KEYS: readonly ['canvas', 'panel', 'surface', 'text', 'muted', 'border', 'accent', 'accentText', 'accentSoft', 'cpu', 'memory', 'gpu'];
export type ThemeColors = Record<typeof THEME_COLOR_KEYS[number], string>;
export type ThemeTrackSource = {
    type: 'asset';
    path: string;
} | {
    type: 'youtube';
    videoId: string;
};
export interface ThemeTrack {
    id: string;
    title: string;
    source: ThemeTrackSource;
}
export interface ThemeDefinition {
    schemaVersion: 1;
    id: string;
    name: string;
    modes: {
        light: ThemeColors;
        dark: ThemeColors;
    };
    typography?: {
        fontFamily: 'pretendard' | 'system' | 'custom';
        fontAsset?: string;
        baseSize?: number;
    };
    shape?: {
        radius?: number;
        spacing?: number;
    };
    background?: {
        asset: string;
        opacity: number;
        fit: 'cover' | 'contain';
    };
    layout?: {
        order: ThemeSectionId[];
        hidden: ThemeSectionId[];
        columns: 1 | 2 | 3;
    };
    bgm?: {
        title: string;
        tracks: ThemeTrack[];
        loop: boolean;
        volume: number;
    };
}
export interface ThemeCatalogEntry {
    pluginId: string;
    name: string;
    version: string;
    contentHash: string;
    definition: ThemeDefinition;
}
export interface ThemeState {
    selectedId: string | null;
    previewId: string | null;
    previewing: boolean;
    active: ThemeCatalogEntry | null;
    available: ThemeCatalogEntry[];
    message: string | null;
}
