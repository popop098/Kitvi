import test from 'node:test';
import assert from 'node:assert/strict';
import { PluginManager } from '../electron/plugins.ts';
import { readAuthorizedPluginResource, pluginResourceResponse } from '../electron/plugin-resource.ts';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { themeFiles, zip } from './theme-test-helpers.mjs';

test('resource response rechecks a queued consent revocation after its async read', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'kitvi-resource-'));
  const manager = new PluginManager({ directory, appVersion:'0.7.0', log:()=>{} });
  t.after(async () => { await manager.dispose(); await rm(directory,{recursive:true,force:true}); });
  const file = path.join(directory,'theme.kitvi-plugin.zip'); await writeFile(file,zip(themeFiles()));
  await manager.confirm((await manager.previewFile(file)).token); await manager.setSystemEnabled(true,true);
  await manager.acceptActivation('kitvi.test-theme',manager.get('kitvi.test-theme').contentHash);
  const disabling = manager.setSystemEnabled(false);
  await assert.rejects(readAuthorizedPluginResource(manager,()=>true,'kitvi.test-theme','theme.json'),/changed|disabled|revoked/i);
  await disabling;
});

test('audio resources declare length and serve bounded byte ranges for real HTMLAudio', async () => {
  const resource = {data:Buffer.from('0123456789'),mime:'audio/wav'};
  const full = pluginResourceResponse(resource,null); assert.equal(full.headers.get('content-length'),'10'); assert.equal(full.status,200);
  const part = pluginResourceResponse(resource,'bytes=2-5'); assert.equal(part.status,206); assert.equal(part.headers.get('content-range'),'bytes 2-5/10'); assert.equal(await part.text(),'2345');
  assert.equal(await pluginResourceResponse(resource,'bytes=-3').text(),'789');
  assert.equal(await pluginResourceResponse(resource,'bytes=8-999').text(),'89');
  for (const range of ['bytes=10-','bytes=-0','bytes=8-2','bytes=1-2,4-5','bytes=900719925474099999-']) assert.equal(pluginResourceResponse(resource,range).status,416);
});
