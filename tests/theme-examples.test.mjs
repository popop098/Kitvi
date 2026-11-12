import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PluginManager } from '../electron/plugins.ts';
import { packageTheme } from '../sdk/tools/package-theme.mjs';
import { themePackageFixtures, writeThemePackageFixture } from './theme-package-fixtures.mjs';

test('SDK packager accepts independent source folders with local and YouTube playback', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'kitvi-theme-fixtures-'));
  const manager = new PluginManager({ directory, appVersion: '0.7.0', log: () => {} });
  t.after(async () => { await manager.dispose(); await rm(directory, { recursive: true, force: true }); });
  await manager.setSystemEnabled(true, true);
  for (const fixture of themePackageFixtures) {
    const source = path.join(directory, fixture.key), target = path.join(directory, fixture.key + '.kitvi-plugin.zip');
    await writeThemePackageFixture(source, fixture);
    await packageTheme(source, target);
    await manager.confirm((await manager.previewFile(target)).token);
    const plugin = manager.state.plugins.at(-1);
    assert.equal(plugin.needsConsent, true); assert.equal(manager.canRun(plugin.id), false);
    await manager.acceptActivation(plugin.id, plugin.contentHash);
    const theme = manager.getThemeDefinition(plugin.id);
    assert.equal(theme.id, plugin.id); assert.equal(theme.layout.columns, fixture.columns);
    assert.equal((await manager.readResource(plugin.id, theme.background.asset)).mime, 'image/png');
    if (fixture.key === 'local-audio') assert.equal((await manager.readResource(plugin.id, theme.bgm.tracks[0].source.path)).mime, 'audio/wav');
    else assert.equal(theme.bgm.tracks[0].source.type, 'youtube');
    assert((await readFile(target)).length < 16 * 1024 * 1024);
  }
});

test('theme packager excludes developer metadata and environment files from published ZIPs', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'kitvi-theme-publish-'));
  t.after(() => rm(directory, { recursive:true, force:true }));
  const source = path.join(directory, 'source'), output = path.join(directory, 'theme.kitvi-plugin.zip');
  await writeThemePackageFixture(source);
  await mkdir(path.join(source, '.git')); await mkdir(path.join(source, 'node_modules'));
  for (const file of ['.env', '.env.local', '.git/config', 'node_modules/private.txt']) await writeFile(path.join(source, file), 'do-not-publish-this-fixture-value');
  await packageTheme(source, output);
  assert.equal((await readFile(output)).includes(Buffer.from('do-not-publish-this-fixture-value')), false);
});

test('theme packager rejects packages the actual host cannot install before publishing output', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'kitvi-theme-invalid-'));
  t.after(() => rm(directory,{recursive:true,force:true}));
  for (const kind of ['permission','entry','font','signature']) {
    const source = path.join(directory,kind), output = path.join(directory,kind+'.kitvi-plugin.zip');
    const fixture = await writeThemePackageFixture(source);
    const manifest = JSON.parse(await readFile(path.join(source,'kitvi-plugin.json'),'utf8'));
    const theme = JSON.parse(await readFile(path.join(source,'theme.json'),'utf8'));
    if (kind==='permission') manifest.permissions=['theme'];
    if (kind==='entry') manifest.entry='missing.html';
    if (kind==='font') { theme.typography={fontFamily:'custom',fontAsset:'assets/font.woff2'}; await writeFile(path.join(source,'assets/font.woff2'),Buffer.alloc(3*1024*1024)); }
    if (kind==='signature') await writeFile(path.join(source,fixture.imageAsset),'not a PNG');
    await writeFile(path.join(source,'kitvi-plugin.json'),JSON.stringify(manifest)); await writeFile(path.join(source,'theme.json'),JSON.stringify(theme));
    await assert.rejects(packageTheme(source,output), undefined, kind);
    await assert.rejects(readFile(output),{code:'ENOENT'});
  }
});
