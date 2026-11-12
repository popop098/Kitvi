import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import semver from 'semver';
import type { InstalledPlugin, PluginUpdateApplyResult, PluginUpdateInfo, PluginUpdatesState } from '../shared/features.ts';
import type { PluginManager } from './plugins.ts';

const CHECK_INTERVAL = 6 * 60 * 60 * 1000;
const MAX_METADATA_BYTES = 1024 * 1024;
export interface PluginUpdateServiceOptions {
  directory: string;
  appVersion: string;
  manager: PluginManager;
  beforeApply: () => void;
  log: (message: string) => void;
  releaseFetch?: typeof fetch;
  intervalMs?: number;
  timeoutMs?: number;
  concurrency?: number;
}
const detail = (error: unknown): string => (error instanceof Error ? error.message : '플러그인 업데이트를 처리하지 못했습니다.').replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 500);
const identity = (plugin: InstalledPlugin): string => JSON.stringify([plugin.source, plugin.version, plugin.contentHash]);
const repository = (source: string): string | null => /^github:([a-z0-9][a-z0-9-]{0,38}\/[a-z0-9_.-]{1,100})$/.exec(source)?.[1] ?? null;
const positive = (value: number | undefined, fallback: number): number => value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;

/** Release checks never enter PluginManager's file/storage mutation queue. */
export class PluginUpdateService extends EventEmitter {
  private readonly options: PluginUpdateServiceOptions;
  private readonly settingsPath: string;
  private value: PluginUpdatesState;
  private readonly identities = new Map<string, string>();
  private readonly generations = new Map<string, number>();
  private readonly controllers = new Set<AbortController>();
  private readonly applyRequests = new Map<string, Promise<PluginUpdateApplyResult>>();
  private checkRequest: Promise<PluginUpdatesState> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private disposed = false;
  private scheduled = false;
  private recheck = false;
  private lastAllowed = false;
  private paused = false;
  private disposal: Promise<void> | null = null;
  private readonly onPlugins = (): void => {
    const allowedChanged = this.lastAllowed !== this.allowed;
    this.lastAllowed = this.allowed;
    if (allowedChanged) this.configureTimer();
    if (!this.allowed) {
      for (const controller of this.controllers) controller.abort();
      this.recheck = false;
      this.value.checking = false;
      this.value.plugins = this.value.plugins.map((item) => item.status === 'checking' ? { ...item, status: 'idle' } : item);
      if (allowedChanged) this.emitState();
    }
    if (!this.disposed && this.reconcile()) {
      this.emitState();
      if (this.checkRequest) this.recheck = true;
      else this.scheduleAutoCheck();
    }
    // Global consent can change without changing the installed package list.
    if (allowedChanged && this.allowed) this.scheduleAutoCheck();
  };

  constructor(options: PluginUpdateServiceOptions) {
    super(); this.options = options; this.settingsPath = path.join(options.directory, 'plugin-update-settings.json');
    let autoCheck = true;
    try {
      if (fs.existsSync(this.settingsPath)) {
        const stat = fs.lstatSync(this.settingsPath);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64000) throw new Error('Invalid plugin update settings file.');
        const saved: unknown = JSON.parse(fs.readFileSync(this.settingsPath, 'utf8'));
        if (saved && typeof saved === 'object' && 'autoCheck' in saved && typeof saved.autoCheck === 'boolean') autoCheck = saved.autoCheck;
      }
    } catch (error) { this.log(`Settings: ${detail(error)}`); }
    this.value = { autoCheck, checking: false, checkedAt: null, plugins: [] };
    this.lastAllowed = this.allowed;
    this.reconcile(); options.manager.on('state', this.onPlugins);
  }

  get state(): PluginUpdatesState { return structuredClone(this.value); }
  private get allowed(): boolean { return !this.disposed && !this.paused && this.options.manager.state.system?.enabled === true; }
  /** Revoke immediately; do not wait for the manager's archive mutation queue. */
  setPaused(paused: boolean): void { this.paused = paused; this.onPlugins(); }

  start(): void {
    if (this.started || this.disposed) return;
    this.started = true; this.configureTimer(); this.scheduleAutoCheck();
  }

  setAutoCheck(value: boolean): PluginUpdatesState {
    if (typeof value !== 'boolean') throw new Error('플러그인 자동 확인 설정값이 올바르지 않습니다.');
    if (this.disposed) return this.state;
    const temporary = `${this.settingsPath}.${randomUUID()}.tmp`;
    try {
      fs.mkdirSync(this.options.directory, { recursive: true });
      if (fs.existsSync(this.settingsPath) && fs.lstatSync(this.settingsPath).isSymbolicLink()) throw new Error('Linked plugin update settings are not allowed.');
      fs.writeFileSync(temporary, JSON.stringify({ schemaVersion: 1, autoCheck: value }, null, 2), { flag: 'wx', mode: 0o600 });
      fs.renameSync(temporary, this.settingsPath);
    } catch (error) { this.log(`Settings: ${detail(error)}`); throw error; }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    const changed = this.value.autoCheck !== value;
    this.value.autoCheck = value; this.configureTimer(); this.emitState();
    if (changed && value) this.scheduleAutoCheck();
    return this.state;
  }

  check(): Promise<PluginUpdatesState> {
    if (!this.allowed) return Promise.resolve(this.state);
    if (!this.checkRequest) this.checkRequest = Promise.resolve().then(() => this.performCheck()).finally(() => {
      this.checkRequest = null;
      if (this.recheck) { this.recheck = false; this.scheduleAutoCheck(); }
    });
    return this.checkRequest;
  }

  apply(id: string): Promise<PluginUpdateApplyResult> {
    if (this.disposed) return Promise.reject(new Error('플러그인 업데이트 서비스가 종료되었습니다.'));
    if (!this.allowed) return Promise.reject(new Error('플러그인 사용을 먼저 켜 주세요.'));
    const existing = this.applyRequests.get(id); if (existing) return existing;
    const request = Promise.resolve().then(() => this.performApply(id)).finally(() => { this.applyRequests.delete(id); });
    this.applyRequests.set(id, request); return request;
  }

  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.disposed = true; this.options.manager.removeListener('state', this.onPlugins);
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    for (const controller of this.controllers) controller.abort();
    this.value.checking = false; this.removeAllListeners();
    this.disposal = Promise.allSettled([...(this.checkRequest ? [this.checkRequest] : []), ...this.applyRequests.values()]).then(() => {});
    return this.disposal;
  }

  private configureTimer(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.started && this.value.autoCheck && this.allowed) {
      this.timer = setInterval(() => { if (!this.disposed && this.value.autoCheck) void this.check(); }, positive(this.options.intervalMs, CHECK_INTERVAL));
      this.timer.unref?.();
    }
  }
  private scheduleAutoCheck(): void {
    if (this.scheduled || !this.started || !this.value.autoCheck || !this.allowed) return;
    this.scheduled = true;
    queueMicrotask(() => { this.scheduled = false; if (this.allowed && this.value.autoCheck) void this.check(); });
  }
  private reconcile(): boolean {
    const installed = this.options.manager.state.plugins, previous = new Map(this.value.plugins.map((item) => [item.id, item]));
    const next = new Map(installed.map((item) => [item.id, identity(item)])); let changed = next.size !== this.identities.size;
    for (const id of new Set([...this.identities.keys(), ...next.keys()])) if (this.identities.get(id) !== next.get(id)) {
      changed = true; this.generations.set(id, (this.generations.get(id) ?? 0) + 1);
    }
    if (!changed) return false;
    this.value.plugins = installed.map((plugin) => {
      if (this.identities.get(plugin.id) === next.get(plugin.id) && previous.has(plugin.id)) return previous.get(plugin.id)!;
      return { id: plugin.id, status: repository(plugin.source) ? 'idle' : 'unsupported', currentVersion: plugin.version, availableVersion: null, checkedAt: null, message: repository(plugin.source) ? null : '로컬 플러그인은 새 ZIP 파일을 선택해 업데이트하세요.' };
    });
    this.identities.clear(); for (const [id, key] of next) this.identities.set(id, key);
    return true;
  }

  private async performCheck(): Promise<PluginUpdatesState> {
    if (!this.allowed) return this.state;
    this.reconcile();
    const groups = new Map<string, Array<{ plugin: InstalledPlugin; generation: number }>>();
    for (const plugin of this.options.manager.state.plugins) {
      const repo = repository(plugin.source); if (!repo) continue;
      const group = groups.get(repo) ?? []; group.push({ plugin, generation: this.generations.get(plugin.id)! }); groups.set(repo, group);
    }
    this.value.checking = true;
    this.value.plugins = this.value.plugins.map((item) => item.status === 'unsupported' ? item : { ...item, status: 'checking', availableVersion: null, message: null }); this.emitState();
    const entries = [...groups.entries()]; let cursor = 0;
    const worker = async (): Promise<void> => {
      while (this.allowed && cursor < entries.length) {
        const [repo, plugins] = entries[cursor++]; let version: string | null = null, failure: string | null = null;
        try { version = await this.fetchVersion(repo); }
        catch (error) { failure = detail(error); this.log(`${repo}: ${failure}`); }
        if (!this.allowed) return;
        const checkedAt = new Date().toISOString();
        for (const { plugin, generation } of plugins) {
          if (this.generations.get(plugin.id) !== generation || this.identities.get(plugin.id) !== identity(plugin)) continue;
          const available = version !== null && semver.gt(version, plugin.version);
          this.updateInfo(plugin.id, { status: failure ? 'error' : available ? 'available' : 'current', availableVersion: available ? version : null, checkedAt, message: failure });
        }
        this.emitState();
      }
    };
    const concurrency = Math.min(6, Math.max(1, Math.floor(positive(this.options.concurrency, 3))));
    await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, worker));
    if (!this.disposed) { this.value.checking = false; this.value.checkedAt = new Date().toISOString(); this.emitState(); }
    return this.state;
  }

  private async fetchVersion(repo: string): Promise<string> {
    const controller = new AbortController(); this.controllers.add(controller);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, positive(this.options.timeoutMs, 10000));
    try {
      const response = await (this.options.releaseFetch ?? fetch)(`https://api.github.com/repos/${repo}/releases/latest`, { signal: controller.signal, redirect: 'error', headers: { Accept: 'application/vnd.github+json', 'User-Agent': `Kitvi/${this.options.appVersion}` } });
      if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error(`GitHub 응답 ${response.status}. 잠시 뒤 다시 확인하세요.`); }
      const length = response.headers.get('content-length');
      if (length && (!/^\d+$/.test(length) || Number(length) > MAX_METADATA_BYTES)) { await response.body.cancel(); throw new Error('플러그인 릴리스 정보의 크기가 허용 범위를 넘었습니다.'); }
      const reader = response.body.getReader(), chunks: Buffer[] = []; let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          size += value.byteLength;
          if (size > MAX_METADATA_BYTES) { await reader.cancel(); throw new Error('플러그인 릴리스 정보의 크기가 허용 범위를 넘었습니다.'); }
          chunks.push(Buffer.from(value));
        }
      } finally { reader.releaseLock(); }
      const release: unknown = JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
      if (!release || typeof release !== 'object' || Array.isArray(release)) throw new Error('플러그인 릴리스 정보의 형식이 올바르지 않습니다.');
      const { tag_name: tag, draft, prerelease } = release as Record<string, unknown>;
      const version = typeof tag === 'string' && tag.length <= 65 ? semver.valid(tag) : null;
      if (!version || (tag !== version && tag !== `v${version}`) || semver.prerelease(version) || draft !== false || prerelease === true) throw new Error('정상적인 정식 버전 태그를 가진 공개 플러그인 릴리스가 필요합니다.');
      return version;
    } catch (error) {
      if (timedOut && !this.disposed) throw new Error('플러그인 업데이트 확인 시간이 초과되었습니다. 잠시 뒤 다시 확인하세요.');
      throw error;
    } finally { clearTimeout(timer); this.controllers.delete(controller); }
  }

  private async performApply(id: string): Promise<PluginUpdateApplyResult> {
    const controller = new AbortController(); this.controllers.add(controller);
    try {
      if (!this.allowed) throw new Error('플러그인 사용을 먼저 켜 주세요.');
      this.options.beforeApply();
      const preview = await this.options.manager.previewUpdate(id, controller.signal);
      controller.signal.throwIfAborted();
      if (!this.allowed) throw new Error('플러그인 사용을 먼저 켜 주세요.');
      const installed = this.options.manager.get(id);
      if (!installed || installed.source !== preview.source) throw new Error('설치된 플러그인이 변경되었습니다. 업데이트를 다시 확인하세요.');
      if (preview.manifest.author !== installed.author || preview.manifest.authorEmail !== installed.authorEmail ||
          [...preview.permissions].sort().join(',') !== [...installed.permissions].sort().join(',')) return { kind: 'review', preview };
      return { kind: 'applied', state: await this.options.manager.confirm(preview.token) };
    } catch (error) {
      if (!this.disposed) { this.updateInfo(id, { status: 'error', message: detail(error) }); this.emitState(); }
      throw error;
    } finally { this.controllers.delete(controller); }
  }
  private updateInfo(id: string, patch: Partial<PluginUpdateInfo>): void { this.value.plugins = this.value.plugins.map((item) => item.id === id ? { ...item, ...patch } : item); }
  private emitState(): void { if (!this.disposed) this.emit('state', this.state); }
  private log(value: string): void { try { this.options.log(`[plugin-updates] ${value}`); } catch { /* Logging must not interrupt plugin operations. */ } }
}
