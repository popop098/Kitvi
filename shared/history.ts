import type { MetricSample, Snapshot } from './contracts.ts';
export function appendHistory(previous: MetricSample[], snapshot: Snapshot): MetricSample[] {
  if (!snapshot.metricsAt) return previous;
  const at = Date.parse(snapshot.metricsAt);
  if (!Number.isFinite(at) || previous.at(-1)?.at === at) return previous;
  const sample: MetricSample = { at, cpu: snapshot.cpu.usage.value, memory: snapshot.memory.usage.value,
    gpus: Object.fromEntries(snapshot.gpus.map((gpu) => [gpu.id, gpu.usage.value])) };
  // A wall-clock correction starts a new time window; old points must not run backwards.
  return [...previous.filter((point) => point.at >= at - 60000 && point.at < at), sample];
}
export function linePath(samples: MetricSample[], getValue: (sample: MetricSample) => number | null, now: number, width = 600, height = 120): string {
  let path = '', previousAt = -Infinity, connected = false;
  for (const sample of samples) {
    const value = getValue(sample);
    if (sample.at < now - 60000 || sample.at > now || value == null || !Number.isFinite(value)) { connected = false; continue; }
    const x = (sample.at - (now - 60000)) / 60000 * width;
    const y = (1 - Math.max(0, Math.min(100, value)) / 100) * height;
    path += `${connected && sample.at - previousAt <= 2500 ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)} `;
    previousAt = sample.at; connected = true;
  }
  return path.trim();
}
