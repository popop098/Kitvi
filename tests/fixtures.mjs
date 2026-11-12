export function snapshot() {
  const at = new Date().toISOString();
  const reading = { value: 5, status: 'ready', updatedAt: at };
  const section = { status: 'ready', updatedAt: at, message: null };
  return { schemaVersion: 1, capturedAt: at, metricsAt: at, cpu: { name: 'Test CPU', cores: 8, threads: 16, usage: reading },
    memory: { totalBytes: 64 * 1024 ** 3, usedBytes: 8 * 1024 ** 3, usage: reading },
    gpus: [{ id: 'luid_0x00000000_0x00000001', name: 'Test GPU', vendor: 'Test', dedicatedMemoryBytes: 16 * 1024 ** 3, driverVersion: null, usage: reading }],
    os: { name: 'Windows 11 Pro', version: '25H2', build: 'test', uptimeSeconds: 100 },
    storage: [], displays: [], devices: [], sections: { hardware: section, gpus: section, storage: section, displays: section, devices: section } };
}
