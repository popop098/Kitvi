import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PluginManager } from '../electron/plugins.ts';
import { definition, themeManifest, themeFiles, zip } from './theme-test-helpers.mjs';

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'kitvi-theme-manager-'));
  const manager = new PluginManager({ directory, appVersion: '0.7.0', log: () => {} });
  t.after(async () => { await manager.dispose(); await rm(directory, { recursive: true, force: true }); });
  let counter = 0;
  return { directory, manager, package: async (files = themeFiles()) => { const file = path.join(directory, `theme-${counter++}.kitvi-plugin.zip`); await writeFile(file, zip(files)); return file; } };
}
async function install(f, files = themeFiles()) { await f.manager.confirm((await f.manager.previewFile(await f.package(files))).token); }
async function activate(f) { await f.manager.setSystemEnabled(true, true); await f.manager.acceptActivation('kitvi.test-theme', f.manager.get('kitvi.test-theme').contentHash); }

test('a pure theme stages without HTML, requires both gates, and reloads its activation receipt', async (t) => {
  const f = await fixture(t); await install(f);
  assert.throws(() => f.manager.getThemeDefinition('kitvi.test-theme'), /disabled|enabled|notice/i);
  await activate(f);
  assert.deepEqual(f.manager.getThemeDefinition('kitvi.test-theme'), definition());
  const registry = JSON.parse(await readFile(path.join(f.directory, 'plugins', 'registry.json'), 'utf8'));
  assert.equal(registry.consents['kitvi.test-theme'].apiVersion, 2); assert.equal(registry.consents['kitvi.test-theme'].kind, 'theme');
  const restarted = new PluginManager({ directory: f.directory, appVersion: '0.7.0', log: () => {} }); t.after(() => restarted.dispose());
  assert.equal(restarted.canRun('kitvi.test-theme'), true); assert.deepEqual(restarted.getThemeDefinition('kitvi.test-theme'), definition());
});

test('theme stage rejects missing assets, mismatching MIME, oversized fonts/audio and missing playback permission', async (t) => {
  const f = await fixture(t);
  const audio = { title: 'BGM', tracks: [{ id: 'local', title: 'Track', source: { type: 'asset', path: 'music.mp3' } }], volume: 20, loop: true };
  const cases = [
    themeFiles(themeManifest(), definition({ id: 'kitvi.other-theme' })),
    themeFiles(themeManifest(), definition({ background: { asset: 'bg.png', opacity: 1, fit: 'cover' } })),
    themeFiles(themeManifest(), definition({ background: { asset: 'bg.png', opacity: 1, fit: 'cover' } }), [{ name: 'bg.png', data: '<script>oops</script>' }]),
    themeFiles(themeManifest(), definition({ bgm: audio }), [{ name: 'music.mp3', data: 'ID3audio' }]),
    themeFiles(themeManifest({ permissions: ['theme', 'playback'] }), definition({ bgm: audio }), [{ name: 'music.mp3', data: Buffer.alloc(4 * 1024 * 1024 + 1, 1) }]),
    themeFiles(themeManifest(), definition({ typography: { fontFamily: 'custom', fontAsset: 'font.woff2' } }), [{ name: 'font.woff2', data: Buffer.alloc(2 * 1024 * 1024 + 1, 1) }]),
  ];
  for (const files of cases) await assert.rejects(f.manager.previewFile(await f.package(files)));
});

test('theme definitions and referenced assets retain runtime integrity checks', async (t) => {
  const f = await fixture(t), png = Buffer.from('89504e470d0a1a0a00000000', 'hex');
  await install(f, themeFiles(themeManifest(), definition({ background: { asset: 'bg.png', opacity: 1, fit: 'cover' } }), [{ name: 'bg.png', data: png }])); await activate(f);
  assert.equal(f.manager.getThemeDefinition('kitvi.test-theme').background.asset, 'bg.png');
  await writeFile(path.join(f.directory, 'plugins', 'resources', 'kitvi.test-theme', 'bg.png'), 'changed');
  assert.throws(() => f.manager.getThemeDefinition('kitvi.test-theme'), /integrity|changed/i);
});

test('a contract-mismatched SDK2 receipt requires fresh consent', async (t) => {
  const f = await fixture(t); await install(f); await activate(f);
  const file = path.join(f.directory, 'plugins', 'registry.json'), registry = JSON.parse(await readFile(file, 'utf8'));
  delete registry.consents['kitvi.test-theme'].apiVersion; delete registry.consents['kitvi.test-theme'].kind; await writeFile(file, JSON.stringify(registry));
  const restarted = new PluginManager({ directory: f.directory, appVersion: '0.7.0', log: () => {} }); t.after(() => restarted.dispose());
  assert.equal(restarted.get('kitvi.test-theme').needsConsent, true); assert.equal(restarted.canRun('kitvi.test-theme'), false);
});
