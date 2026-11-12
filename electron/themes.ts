import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { validatePluginId } from '../shared/plugin-schema.ts';
import type { ThemeCatalogEntry, ThemeState } from '../shared/themes.ts';
import type { PluginManager } from './plugins.ts';

export interface ThemeServiceOptions { directory: string; manager: PluginManager; log: (message: string) => void }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'Theme operation failed.'; }
function assertNoLinks(target: string): void {
  const absolute = path.resolve(target); let cursor = path.parse(absolute).root;
  for (const segment of absolute.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    try { if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('Theme settings cannot use links or junctions.'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}

/** Selection is durable; preview and all playback are deliberately temporary. */
export class ThemeService extends EventEmitter {
  private readonly options: ThemeServiceOptions;
  private readonly file: string;
  private selectedId: string | null = null;
  private previewId: string | null = null;
  private previewing = false;
  private message: string | null = null;
  private disposed = false;
  private readonly onPlugins = () => { if (!this.disposed) this.emit('state', this.reconcile()); };

  constructor(options: ThemeServiceOptions) {
    super(); this.options = options; this.file = path.resolve(options.directory, 'theme-selection.json');
    try {
      assertNoLinks(options.directory); fs.mkdirSync(options.directory, { recursive: true }); assertNoLinks(this.file);
      if (fs.existsSync(this.file)) {
        const stat = fs.statSync(this.file); if (!stat.isFile() || stat.size > 4096) throw new Error('Theme selection settings are invalid.');
        const raw: unknown = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some((key) => !['version', 'selectedId'].includes(key)) || (raw as { version?: unknown }).version !== 1) throw new Error('Theme selection settings are invalid.');
        const id = (raw as { selectedId?: unknown }).selectedId; this.selectedId = id === null ? null : validatePluginId(id);
      }
    } catch (error) { this.message = errorMessage(error); options.log(`Theme: ${this.message}`); }
    options.manager.on('state', this.onPlugins); this.reconcile();
  }
  private save(): void {
    assertNoLinks(this.file); const temporary = `${this.file}.${randomUUID()}.tmp`;
    try { fs.writeFileSync(temporary, JSON.stringify({ version: 1, selectedId: this.selectedId }, null, 2), { flag: 'wx', mode: 0o600 }); assertNoLinks(this.file); fs.renameSync(temporary, this.file); }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
  private reconcile(): ThemeState {
    const managerState = this.options.manager.state, plugins = managerState.plugins, available: ThemeCatalogEntry[] = [];
    if (!managerState.system.enabled) { this.previewing = false; this.previewId = null; }
    let selectionChanged = false;
    for (const plugin of plugins) {
      if (plugin.apiVersion !== 2 || plugin.kind !== 'theme' || !this.options.manager.canRun(plugin.id)) continue;
      try { available.push({ pluginId: plugin.id, name: plugin.name, version: plugin.version, contentHash: plugin.contentHash, definition: this.options.manager.getThemeDefinition(plugin.id) }); }
      catch (error) {
        if (plugin.id === this.selectedId || plugin.id === this.previewId) {
          this.message = errorMessage(error); this.options.log(`Theme: ${this.message}`);
          if (this.selectedId === plugin.id) { this.selectedId = null; selectionChanged = true; }
          if (this.previewId === plugin.id) { this.previewId = null; this.previewing = false; }
        }
      }
    }
    if (this.selectedId !== null) {
      const selected = plugins.find((plugin) => plugin.id === this.selectedId);
      if (!selected || selected.needsConsent || selected.apiVersion !== 2 || selected.kind !== 'theme') { this.selectedId = null; selectionChanged = true; }
    }
    if (this.previewing && this.previewId !== null && !available.some((item) => item.pluginId === this.previewId)) { this.previewId = null; this.previewing = false; }
    if (selectionChanged) { try { this.save(); } catch (error) { this.message = errorMessage(error); this.options.log(`Theme: ${this.message}`); } }
    const activeId = this.previewing ? this.previewId : this.selectedId;
    return { selectedId: this.selectedId, previewId: this.previewId, previewing: this.previewing, active: available.find((item) => item.pluginId === activeId) ?? null, available, message: this.message };
  }
  get state(): ThemeState {
    if (this.disposed) return { selectedId: this.selectedId, previewId: null, previewing: false, active: null, available: [], message: 'Theme service has been disposed.' };
    return structuredClone(this.reconcile());
  }
  private validateSelection(id: string | null): void {
    if (this.disposed) throw new Error('Theme service has been disposed.');
    if (id === null) return;
    validatePluginId(id);
    if (!this.reconcile().available.some((theme) => theme.pluginId === id)) throw new Error('Theme is not installed, enabled and accepted, or its resources failed validation.');
  }
  preview(id: string | null): ThemeState {
    this.validateSelection(id); this.message = null; this.previewing = true; this.previewId = id;
    const state = this.state; this.emit('state', state); return state;
  }
  apply(id: string | null): ThemeState {
    this.validateSelection(id); const previous = this.selectedId; this.selectedId = id;
    try { this.save(); } catch (error) { this.selectedId = previous; throw error; }
    this.message = null; this.previewing = false; this.previewId = null;
    const state = this.state; this.emit('state', state); return state;
  }
  cancelPreview(): ThemeState {
    if (this.disposed) throw new Error('Theme service has been disposed.');
    this.previewing = false; this.previewId = null; this.message = null;
    const state = this.state; this.emit('state', state); return state;
  }
  dispose(): void { this.disposed = true; this.previewing = false; this.previewId = null; this.options.manager.off('state', this.onPlugins); this.removeAllListeners(); }
}
