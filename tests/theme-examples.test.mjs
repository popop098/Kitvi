import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, cp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PluginManager } from '../electron/plugins.ts';
import { packageTheme } from '../sdk/tools/package-theme.mjs';

test('both SDK themes package, install, consent and expose validated local assets', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'kitvi-examples-'));
  const manager = new PluginManager({ directory, appVersion: '0.7.0', log: () => {} });
  t.after(async () => { await manager.dispose(); await rm(directory, { recursive: true, force: true }); });
  await manager.setSystemEnabled(true, true);
  for (const folder of ['cozy-desk', 'midnight-grid']) {
    const source = path.resolve(import.meta.dirname, '../sdk/examples', folder), target = path.join(directory, folder + '.kitvi-plugin.zip');
    await packageTheme(source, target);
    await manager.confirm((await manager.previewFile(target)).token);
    const plugin = manager.state.plugins.at(-1);
    assert.equal(plugin.needsConsent, true); assert.equal(manager.canRun(plugin.id), false);
    await manager.acceptActivation(plugin.id, plugin.contentHash);
    const theme = manager.getThemeDefinition(plugin.id);
    assert.equal(theme.id, plugin.id); assert.equal(theme.layout.columns, folder === 'cozy-desk' ? 2 : 3);
    assert.equal((await manager.readResource(plugin.id, theme.background.asset)).mime, 'image/png');
    assert((await readFile(target)).length < 16 * 1024 * 1024);
  }
});

test('theme packager excludes developer metadata and environment files from published ZIPs', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'kitvi-theme-publish-'));
  t.after(() => rm(directory, { recursive:true, force:true }));
  const source = path.join(directory, 'source'), output = path.join(directory, 'theme.kitvi-plugin.zip');
  await cp(path.resolve(import.meta.dirname, '../sdk/examples/midnight-grid'), source, { recursive:true });
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
    await cp(path.resolve(import.meta.dirname,'../sdk/examples/cozy-desk'),source,{recursive:true});
    const manifest = JSON.parse(await readFile(path.join(source,'kitvi-plugin.json'),'utf8'));
    const theme = JSON.parse(await readFile(path.join(source,'theme.json'),'utf8'));
    if (kind==='permission') manifest.permissions=['theme'];
    if (kind==='entry') manifest.entry='missing.html';
    if (kind==='font') { theme.typography={fontFamily:'custom',fontAsset:'assets/font.woff2'}; await writeFile(path.join(source,'assets/font.woff2'),Buffer.alloc(3*1024*1024)); }
    if (kind==='signature') await writeFile(path.join(source,'assets/paper.png'),'not a PNG');
    await writeFile(path.join(source,'kitvi-plugin.json'),JSON.stringify(manifest)); await writeFile(path.join(source,'theme.json'),JSON.stringify(theme));
    await assert.rejects(packageTheme(source,output), undefined, kind);
    await assert.rejects(readFile(output),{code:'ENOENT'});
  }
});
