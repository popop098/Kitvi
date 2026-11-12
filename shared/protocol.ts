import type { Snapshot } from './contracts.ts';
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown) => value === null || typeof value === 'string';
const number = (value: unknown) => value === null || typeof value === 'number' && Number.isFinite(value) && value >= 0;
const time = (value: unknown) => value === null || typeof value === 'string' && Number.isFinite(Date.parse(value));
const status = (value: unknown) => ['loading', 'ready', 'unavailable', 'error'].includes(value as string);
function reading(value: unknown): boolean {
  return object(value) && number(value.value) && (value.value === null || (value.value as number) <= 100) && status(value.status) && time(value.updatedAt) &&
    (value.status !== 'ready' || value.value !== null);
}
function list(value: unknown, validate: (item: Record<string, unknown>) => boolean): boolean {
  return Array.isArray(value) && value.length <= 20000 && value.every((item) => object(item) && validate(item));
}
export function isSnapshot(value: unknown): value is Snapshot {
  if (!object(value) || value.schemaVersion !== 1 || typeof value.capturedAt !== 'string' || !time(value.capturedAt) || !time(value.metricsAt)) return false;
  const { cpu, memory, os, sections } = value;
  return object(cpu) && text(cpu.name) && number(cpu.cores) && number(cpu.threads) && reading(cpu.usage) &&
    object(memory) && number(memory.totalBytes) && number(memory.usedBytes) && reading(memory.usage) &&
    object(os) && text(os.name) && text(os.version) && text(os.build) && number(os.uptimeSeconds) &&
    list(value.gpus, (item) => typeof item.id === 'string' && typeof item.name === 'string' && typeof item.vendor === 'string' && number(item.dedicatedMemoryBytes) && text(item.driverVersion) && reading(item.usage)) &&
    list(value.storage, (item) => typeof item.id === 'string' && typeof item.name === 'string' && typeof item.label === 'string' && number(item.totalBytes) && number(item.freeBytes) && number(item.usedBytes)) &&
    list(value.displays, (item) => typeof item.id === 'string' && text(item.name) && number(item.width) && number(item.height) && number(item.refreshRate) && typeof item.primary === 'boolean') &&
    list(value.devices, (item) => typeof item.id === 'string' && typeof item.name === 'string' && typeof item.type === 'string' && text(item.manufacturer) && typeof item.status === 'string' && number(item.errorCode)) &&
    object(sections) && ['hardware', 'gpus', 'storage', 'displays', 'devices'].every((key) => {
      const section = sections[key]; return object(section) && status(section.status) && time(section.updatedAt) && text(section.message);
    });
}
