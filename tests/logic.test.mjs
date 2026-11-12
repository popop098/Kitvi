import test from 'node:test';
import assert from 'node:assert/strict';
import { formatBytes, formatPercent, formatUptime } from '../shared/format.ts';
import { appendHistory, linePath } from '../shared/history.ts';
import { restoreBounds } from '../electron/window-bounds.ts';
import { collectionFreshness } from '../shared/freshness.ts';

test('bytes keep real 64-bit VRAM size and missing values distinct from zero', () => {
  assert.equal(formatBytes(16 * 1024 ** 3), '16 GB');
  assert.equal(formatBytes(64 * 1024 ** 3), '64 GB');
  assert.equal(formatBytes(null), '정보 없음');
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(NaN), '정보 없음');
});
test('percent and uptime do not manufacture missing readings', () => {
  assert.equal(formatPercent(null), '—'); assert.equal(formatPercent(0), '0%');
  assert.equal(formatPercent(17.36), '17.4%'); assert.equal(formatPercent(Infinity), '—');
  assert.equal(formatUptime(90060), '1일 1시간 1분'); assert.equal(formatUptime(null), '정보 없음');
});
test('chart leaves a real gap at null samples', () => {
  const samples = [0, 1000, 2000].map((offset, index) => ({ at: 60000 + offset, cpu: index === 1 ? null : 10, memory: null, gpus: {} }));
  const path = linePath(samples, (s) => s.cpu, 62000);
  assert.equal((path.match(/M/g) || []).length, 2); assert.equal((path.match(/L/g) || []).length, 0);
});
test('chart breaks after suspension rather than bridging an uncollected interval', () => {
  const samples = [60000, 65000].map((at) => ({ at, cpu: 20, memory: null, gpus: {} }));
  assert.equal((linePath(samples, (s) => s.cpu, 65000).match(/M/g) || []).length, 2);
});
test('history uses metric timestamps and keeps GPU identities separate', () => {
  const snapshot = { metricsAt: '2026-11-12T00:01:00Z', cpu: { usage: { value: 10 } }, memory: { usage: { value: null } }, gpus: [{ id: 'a', usage: { value: 5 } }, { id: 'b', usage: { value: 80 } }] };
  const first = appendHistory([], snapshot);
  assert.equal(first.length, 1); assert.deepEqual(first[0].gpus, { a: 5, b: 80 });
  assert.strictEqual(appendHistory(first, snapshot), first);
  assert.equal(appendHistory(first, { ...snapshot, metricsAt: '2026-11-12T00:02:01Z' }).length, 1);
});
test('off-screen saved bounds return to a visible work area', () => {
  const bounds = restoreBounds({ x: 9000, y: -9000, width: 1280, height: 860 }, [{ x: 0, y: 0, width: 1920, height: 1040 }]);
  assert.deepEqual(bounds, { x: 320, y: 90, width: 1280, height: 860 });
});
test('negative-coordinate monitors and minimum size restore correctly', () => {
  const areas = [{ x: 0, y: 0, width: 1920, height: 1040 }, { x: -1920, y: 0, width: 1920, height: 1040 }];
  const bounds = restoreBounds({ x: -1500, y: 100, width: 1000, height: 700 }, areas);
  assert.deepEqual(bounds, { x: -1500, y: 100, width: 1000, height: 700 });
  const small = restoreBounds({ x: 0, y: 0, width: 20, height: 20 }, areas);
  assert.equal(small.width, 960); assert.equal(small.height, 640);
});
test('inventory freshness ages independently from live metric snapshots', () => {
  const info = { status: 'ready', updatedAt: '2026-11-12T00:00:00Z', message: null };
  assert.equal(collectionFreshness(info, Date.parse(info.updatedAt) + 16000, 15000), 'stale');
  assert.equal(collectionFreshness(info, Date.parse(info.updatedAt) + 14000, 15000), 'ready');
  assert.equal(collectionFreshness({ ...info, status: 'loading', updatedAt: null }, Date.now(), 15000), 'loading');
  assert.equal(collectionFreshness({ ...info, status: 'error' }, Date.now(), 15000), 'error');
});
