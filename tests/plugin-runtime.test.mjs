import test from 'node:test';
import assert from 'node:assert/strict';
import { PluginRuntime } from '../electron/plugin-runtime.ts';

test('global off revokes synchronously, waits for cleanup and creates a fresh service on enable', async () => {
  const instances = []; let finish;
  const runtime = new PluginRuntime(() => {
    const service = { stop: () => new Promise(resolve => { finish = resolve; }) };
    instances.push(service); return service;
  });
  assert.equal(runtime.enabled, false);
  assert.equal(instances.length, 0, 'off must not initialize plugin workers');
  await runtime.setEnabled(true);
  const first = runtime.current;
  const stopping = runtime.setEnabled(false);
  assert.equal(runtime.enabled, false);
  assert.throws(() => runtime.current, /꺼져/);
  const enabling = runtime.setEnabled(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(instances.length, 1, 'old workers must stop before replacement');
  finish(); await stopping; await enabling;
  assert.equal(runtime.enabled, true);
  assert.notEqual(runtime.current, first);
  assert.equal(instances.length, 2);
});

test('shutdown cancels a pending reenable without creating new workers', async () => {
  let finish, count = 0;
  const runtime = new PluginRuntime(() => { count++; return { stop: () => new Promise(resolve => { finish = resolve; }) }; });
  await runtime.setEnabled(true);
  const disabling = runtime.setEnabled(false), enabling = runtime.setEnabled(true);
  const shutdown = runtime.stop();
  await new Promise(resolve => setImmediate(resolve)); finish();
  await Promise.all([disabling, enabling, shutdown]);
  assert.equal(runtime.enabled, false); assert.equal(count, 1);
  await assert.rejects(runtime.setEnabled(true), /종료/);
});
