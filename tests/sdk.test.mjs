import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

test('SDK helpers preserve the isolated legacy bridge and request tracks without starting them', async () => {
  const sent = [], parent = { postMessage: packet => sent.push(packet) }, listeners = {};
  const window = { parent, addEventListener: (type, callback) => { listeners[type] = callback; } };
  vm.runInNewContext(await readFile(new URL('../sdk/kitvi-sdk.js', import.meta.url), 'utf8'), { window, setTimeout: () => 1, clearTimeout: () => {}, console });
  const sdk = window.kitviPlugin; sdk.ready();
  assert.equal(sent[0].type, 'kitvi:hello');
  const requested = sdk.playback.requestTrack('soft-loop');
  const packet = sent.at(-1); assert.equal(packet.method, 'playback.requestTrack');
  assert.deepEqual(JSON.parse(JSON.stringify(packet.params)), { trackId: 'soft-loop' });
  assert(!sent.some(item => /playVideo|playTrack|media.start/.test(item.method || '')));
  let resolved = false; requested.then(() => { resolved = true; });
  listeners.message({ source: {}, data: { type: 'kitvi:response', requestId: packet.requestId, ok: true, result: 'spoof' } });
  await Promise.resolve(); assert.equal(resolved, false);
  listeners.message({ source: parent, data: { type: 'kitvi:response', requestId: packet.requestId, ok: true, result: { requestedTrackId: 'soft-loop' } } });
  assert.deepEqual(await requested, { requestedTrackId: 'soft-loop' });
  const legacy = sdk.request('storage.get', { key: 'example' }); const call = sent.at(-1);
  listeners.message({ source: parent, data: { type: 'kitvi:response', requestId: call.requestId, ok: true, result: 42 } });
  assert.equal(await legacy, 42);
});
