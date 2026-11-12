import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Appearance } from '../shared/contracts.ts';
import type { Bounds } from './window-bounds.ts';
export interface Settings { schemaVersion: 1; appearance: Appearance; bounds: Bounds | null; maximized: boolean }
export class SettingsStore {
  value: Settings = { schemaVersion: 1, appearance: 'light', bounds: null, maximized: false };
  private path: string;
  constructor(directory: string) {
    this.path = join(directory, 'settings.json'); mkdirSync(directory, { recursive: true });
    try {
      if (existsSync(this.path) && statSync(this.path).size <= 64000) {
        const data = JSON.parse(readFileSync(this.path, 'utf8'));
        this.value = { schemaVersion: 1, appearance: data.appearance === 'dark' ? 'dark' : 'light',
          bounds: data.bounds && typeof data.bounds === 'object' ? data.bounds : null, maximized: data.maximized === true };
      }
    } catch { }
  }
  save(patch: Partial<Settings>) {
    const next = { ...this.value, ...patch, schemaVersion: 1 as const };
    const temporary = this.path + '.tmp'; writeFileSync(temporary, JSON.stringify(next, null, 2), 'utf8'); renameSync(temporary, this.path);
    this.value = next;
  }
}
