import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PluginManager } from '../electron/plugins.ts';
import { ThemeService } from '../electron/themes.ts';
import { themeFiles, themeManifest, zip } from './theme-test-helpers.mjs';

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'kitvi-theme-service-'));
  const manager = new PluginManager({ directory, appVersion: '0.7.0', log: () => {} });
  const file = path.join(directory, 'theme.kitvi-plugin.zip'); await writeFile(file, zip(themeFiles()));
  await manager.confirm((await manager.previewFile(file)).token); await manager.setSystemEnabled(true, true); await manager.acceptActivation('kitvi.test-theme', manager.get('kitvi.test-theme').contentHash);
  const service = new ThemeService({ directory, manager, log: () => {} });
  t.after(async () => { service.dispose(); await manager.dispose(); await rm(directory, { recursive: true, force: true }); });
  return { directory, manager, service };
}
test('preview and cancel preserve selection; apply persists and preview default can be canceled', async (t) => {
  const f = await fixture(t); assert.equal(f.service.state.active, null); assert.equal(f.service.state.available.length, 1);
  assert.equal(f.service.preview('kitvi.test-theme').active.pluginId, 'kitvi.test-theme'); assert.equal(f.service.state.selectedId, null);
  assert.equal(f.service.cancelPreview().active, null);
  f.service.apply('kitvi.test-theme'); assert.equal(f.service.preview(null).active, null);
  assert.equal(f.service.state.previewing, true, 'a default preview is distinct from no preview');
  assert.equal(f.service.cancelPreview().active.pluginId, 'kitvi.test-theme');
  assert.equal(f.service.state.previewing, false);
  const restarted = new ThemeService({ directory: f.directory, manager: f.manager, log: () => {} }); t.after(() => restarted.dispose());
  assert.equal(restarted.state.active.pluginId, 'kitvi.test-theme'); assert.equal(restarted.state.previewId, null);
  assert.equal(f.service.apply(null).selectedId, null);
});
test('global off and disable restore default, retaining selection for later reenable', async (t) => {
  const f = await fixture(t); f.service.apply('kitvi.test-theme');
  await f.manager.setSystemEnabled(false); assert.equal(f.service.state.active, null); assert.equal(f.service.state.selectedId, 'kitvi.test-theme');
  await f.manager.setSystemEnabled(true); assert.equal(f.service.state.active.pluginId, 'kitvi.test-theme');
  await f.manager.setEnabled('kitvi.test-theme', false); assert.equal(f.service.state.active, null); assert.equal(f.service.state.selectedId, 'kitvi.test-theme');
  await f.manager.setEnabled('kitvi.test-theme', true); assert.equal(f.service.state.active.pluginId, 'kitvi.test-theme');
  await f.manager.remove('kitvi.test-theme'); assert.equal(f.service.state.active, null); assert.equal(f.service.state.selectedId, null);
});
test('unknown selection is rejected and a tampered active theme restores defaults', async (t) => {
  const f = await fixture(t); assert.throws(() => f.service.apply('kitvi.missing-theme')); f.service.apply('kitvi.test-theme');
  await writeFile(path.join(f.directory, 'plugins', 'resources', 'kitvi.test-theme', 'theme.json'), '{}');
  assert.equal(f.service.state.active, null); assert.equal(f.service.state.selectedId, null); assert.match(f.service.state.message, /integrity|changed/i);
});
test('global off cancels default preview and an unconsented replacement clears persisted selection', async (t) => {
  const f = await fixture(t); f.service.apply('kitvi.test-theme'); f.service.preview(null);
  await f.manager.setSystemEnabled(false); await f.manager.setSystemEnabled(true);
  assert.equal(f.service.state.active?.pluginId, 'kitvi.test-theme');
  const file = path.join(f.directory, 'update.kitvi-plugin.zip'); await writeFile(file, zip(themeFiles(themeManifest({ version: '1.1.0' }))));
  await f.manager.confirm((await f.manager.previewFile(file)).token);
  assert.equal(f.service.state.active, null); assert.equal(f.service.state.selectedId, null);
  await f.manager.acceptActivation('kitvi.test-theme', f.manager.get('kitvi.test-theme').contentHash);
  assert.equal(f.service.state.active, null);
});
