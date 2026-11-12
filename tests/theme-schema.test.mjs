import test from 'node:test';
import assert from 'node:assert/strict';
import { validateThemeDefinition, themeResourceReferences } from '../shared/theme-schema.ts';
import { validatePluginManifest } from '../shared/plugin-schema.ts';

export const colors = () => Object.fromEntries(['canvas', 'panel', 'surface', 'text', 'muted', 'border', 'accent', 'accentText', 'accentSoft', 'cpu', 'memory', 'gpu'].map((key) => [key, '#123456']));
export const definition = (overrides = {}) => ({ schemaVersion: 1, id: 'kitvi.test-theme', name: 'Test theme', modes: { light: colors(), dark: colors() }, ...overrides });
export const themeManifest = (overrides = {}) => ({ apiVersion: 2, kind: 'theme', theme: 'theme.json', id: 'kitvi.test-theme', name: 'Test theme', version: '1.0.0', minKitviVersion: '0.7.0', description: 'A declarative theme.', author: 'Kitvi', permissions: ['theme'], ...overrides });

test('theme schema accepts a declarative theme and enumerates only local references', () => {
  const value = definition({ typography: { fontFamily: 'custom', fontAsset: 'font.woff2', baseSize: 16 }, shape: { radius: 12, spacing: 1 }, background: { asset: 'background.png', opacity: 0.5, fit: 'cover' }, layout: { order: ['bgm', 'summary'], hidden: ['devices'], columns: 2 }, bgm: { title: 'Music', tracks: [{ id: 'local', title: 'Local', source: { type: 'asset', path: 'music.mp3' } }, { id: 'video', title: 'Video', source: { type: 'youtube', videoId: 'abcdefghijk' } }], volume: 25, loop: false } });
  assert.deepEqual(validateThemeDefinition(value), value);
  assert.deepEqual(themeResourceReferences(value), [{ path: 'font.woff2', kind: 'font' }, { path: 'background.png', kind: 'image' }, { path: 'music.mp3', kind: 'audio' }]);
});

test('theme schema rejects CSS, remote assets, unsafe paths, unknown controls and invalid layouts', () => {
  const invalid = [
    { css: 'body{}' }, { modes: { light: { ...colors(), canvas: 'url(https://evil.example)' }, dark: colors() } },
    { modes: { light: { canvas: '#fff' }, dark: colors() } }, { typography: { fontFamily: 'custom', fontAsset: '../font.woff2' } },
    { typography: { fontFamily: 'system', fontAsset: 'font.woff2' } }, { typography: { fontFamily: 'system', baseSize: 21 } },
    { background: { asset: 'https://evil.example/a.png', opacity: 1, fit: 'cover' } }, { background: { asset: 'bg.svg', opacity: 1, fit: 'cover' } },
    { shape: { radius: 21 } }, { shape: { spacing: 0.1 } }, { layout: { order: ['summary', 'summary'], hidden: [], columns: 2 } },
    { layout: { order: ['summary'], hidden: ['summary'], columns: 2 } }, { layout: { order: ['header'], hidden: [], columns: 2 } },
    { bgm: { title: 'Music', tracks: [{ id: 'video', title: 'Video', source: { type: 'youtube', videoId: 'https://youtu.be/a' } }], volume: 25, loop: false } },
    { bgm: { title: 'Music', tracks: [{ id: 'local', title: 'Local', source: { type: 'asset', path: 'music.js' } }], volume: 101, loop: false } },
  ];
  for (const override of invalid) assert.throws(() => validateThemeDefinition(definition(override)), JSON.stringify(override));
});

test('SDK2 theme manifest requires explicit capability, compatible version and optional HTML entry', () => {
  assert.equal(validatePluginManifest(themeManifest(), '0.7.0').entry, undefined);
  assert.equal(validatePluginManifest(themeManifest({ entry: 'config.html', permissions: ['theme', 'playback'] }), '0.7.0').kind, 'theme');
  for (const override of [{ minKitviVersion: '0.6.0' }, { kind: 'tool' }, { permissions: [] }, { theme: 'theme.css' }, { entry: 'main.js' }, { apiVersion: 1 }, { permissions: ['theme', 'theme'] }]) assert.throws(() => validatePluginManifest(themeManifest(override), '0.7.0'));
});
