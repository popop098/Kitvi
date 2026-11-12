import type { FeatureApi } from './features.ts';
export type ReadStatus = 'loading' | 'ready' | 'unavailable' | 'error';
export type Appearance = 'light' | 'dark';
export interface Reading { value: number | null; status: ReadStatus; updatedAt: string | null }
export interface CollectionInfo { status: ReadStatus; updatedAt: string | null; message: string | null }
export interface GpuInfo { id: string; name: string; vendor: string; dedicatedMemoryBytes: number | null; driverVersion: string | null; usage: Reading }
export interface DriveInfo { id: string; name: string; label: string; totalBytes: number | null; freeBytes: number | null; usedBytes: number | null }
export interface DisplayInfo { id: string; name: string | null; width: number | null; height: number | null; refreshRate: number | null; primary: boolean }
export interface DeviceInfo { id: string; name: string; type: string; manufacturer: string | null; status: string; errorCode: number | null }
export interface Snapshot {
  schemaVersion: 1;
  capturedAt: string;
  metricsAt: string | null;
  cpu: { name: string | null; cores: number | null; threads: number | null; usage: Reading };
  memory: { totalBytes: number | null; usedBytes: number | null; usage: Reading };
  gpus: GpuInfo[];
  os: { name: string | null; version: string | null; build: string | null; uptimeSeconds: number | null };
  storage: DriveInfo[];
  displays: DisplayInfo[];
  devices: DeviceInfo[];
  sections: Record<'hardware' | 'gpus' | 'storage' | 'displays' | 'devices', CollectionInfo>;
}
export interface CollectorStatus { state: 'starting' | 'running' | 'reconnecting' | 'error'; message: string | null; lastSnapshotAt: string | null }
export interface DashboardState { snapshot: Snapshot | null; collector: CollectorStatus }
export interface WindowInfo { maximized: boolean; version: string }
export interface MetricSample { at: number; cpu: number | null; memory: number | null; gpus: Record<string, number | null> }
export interface KitviApi extends FeatureApi {
  getState(): Promise<DashboardState>;
  refresh(): Promise<void>;
  retryCollector(): Promise<void>;
  onState(listener: (state: DashboardState) => void): () => void;
  getAppearance(): Promise<Appearance>;
  setAppearance(appearance: Appearance): Promise<Appearance>;
  getWindow(): Promise<WindowInfo>;
  onWindow(listener: (info: WindowInfo) => void): () => void;
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
}
