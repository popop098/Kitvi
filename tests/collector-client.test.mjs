import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { CollectorClient } from '../electron/collector-client.ts';
import { isSnapshot } from '../shared/protocol.ts';
import { snapshot } from './fixtures.mjs';
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
class FakeChild extends EventEmitter {
  stdout = new PassThrough(); stderr = new PassThrough(); stdin = new PassThrough(); exitCode = null;
  constructor() { super(); this.stdin.on('data', (chunk) => { if (chunk.toString().includes('shutdown')) { this.exitCode = 0; queueMicrotask(() => this.emit('close', 0)); } }); }
  kill() { this.exitCode = 1; queueMicrotask(() => this.emit('close', 1)); return true; }
  send(value) { this.stdout.write(JSON.stringify(value) + '\n'); }
  finish() { this.exitCode = 1; this.emit('close', 1); }
}
test('protocol validates a complete snapshot and rejects malformed/nan readings', () => {
  assert.equal(isSnapshot(snapshot()), true);
  assert.equal(isSnapshot({ schemaVersion: 1 }), false);
  const bad = snapshot(); bad.cpu.usage = { value: NaN, status: 'ready', updatedAt: null };
  assert.equal(isSnapshot(bad), false);
});
test('collector automatically restarts once, then offers manual recovery', async () => {
  const children = []; let options;
  const client = new CollectorClient({ executable: 'collector.exe', retryDelay: 2, readyTimeout: 1000, spawn: (_file, _args, opts) => { options = opts; const child = new FakeChild(); children.push(child); return child; } });
  try {
    client.start(); assert.equal(children.length, 1); assert.equal(options.windowsHide, true); assert.equal(options.shell, false);
    children[0].send({ type: 'snapshot', snapshot: snapshot() }); assert.equal(client.state.collector.state, 'running');
    children[0].finish(); await sleep(15); assert.equal(children.length, 2);
    children[1].send({ type: 'snapshot', snapshot: snapshot() }); children[1].finish(); await sleep(15);
    assert.equal(children.length, 2); assert.equal(client.state.collector.state, 'error');
    await client.retry(); assert.equal(children.length, 3);
    children[2].send({ type: 'snapshot', snapshot: snapshot() }); assert.equal(client.state.collector.state, 'running');
  } finally { await client.stop(); }
});
test('malformed output never becomes a healthy collector snapshot', async () => {
  let child;
  const client = new CollectorClient({ executable: 'collector.exe', readyTimeout: 1000, spawn: () => (child = new FakeChild()) });
  try { client.start(); assert(child); child.send({ type: 'snapshot', snapshot: { schemaVersion: 1 } }); assert.equal(client.state.snapshot, null); assert.notEqual(client.state.collector.state, 'running'); }
  finally { await client.stop(); }
});
test('shutdown wins over an in-flight manual retry', async () => {
  const children = [];
  const client = new CollectorClient({ executable: 'collector.exe', spawn: () => { const child = new FakeChild(); children.push(child); return child; } });
  client.start();
  const retrying = client.retry(); await client.stop(); await retrying;
  try { assert.equal(children.length, 1, 'retry must not spawn a child after shutdown'); }
  finally { await client.stop(); }
});
test('a suspended event loop gets a fresh grace period after wake', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: Date.now() });
  const children = [];
  const client = new CollectorClient({ executable: 'collector.exe', spawn: () => { const child = new FakeChild(); children.push(child); return child; } });
  try {
    client.start(); children[0].send({ type: 'snapshot', snapshot: snapshot() });
    t.mock.timers.tick(60 * 60 * 1000);
    assert.equal(client.state.collector.state, 'running', 'sleep must not consume the automatic restart budget');
    assert.equal(children.length, 1);
  } finally { t.mock.timers.reset(); await client.stop(); }
});
