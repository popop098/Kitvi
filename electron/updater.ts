import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import semver from 'semver';
import type { UpdateState } from '../shared/features.ts';

const RELEASE_URL = 'https://github.com/popop098/Kitvi/releases';
const RELEASE_API = 'https://api.github.com/repos/popop098/Kitvi/releases?per_page=100';
const MAX_RELEASE_BYTES = 1024 * 1024;
interface UpdateInfo { version: string }
interface CheckResult { updateInfo: UpdateInfo; isUpdateAvailable?: boolean }
/** The Electron dependency is loaded only when a supported installation checks. */
export interface UpdateAdapter {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  allowDowngrade: boolean;
  logger?: { info: (...values: unknown[]) => void; warn: (...values: unknown[]) => void; error: (...values: unknown[]) => void; debug: (...values: unknown[]) => void } | null;
  on(event: string, listener: (...values: any[]) => void): unknown;
  removeListener(event: string, listener: (...values: any[]) => void): unknown;
  checkForUpdates(): Promise<CheckResult | null>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}
export interface UpdateServiceOptions {
  directory: string;
  currentVersion: string;
  isPackaged: boolean;
  executablePath: string;
  resourcesPath: string;
  isBusy: () => boolean;
  beforeInstall: () => Promise<void>;
  log: (message: string) => void;
  updater?: UpdateAdapter;
  releaseFetch?: typeof fetch;
}
const isFile = (path: string) => { try { return statSync(path).isFile(); } catch { return false; } };
const detail = (error: unknown) => {
  const value = error instanceof Error ? error.message : typeof error === 'string' ? error : '알 수 없는 오류';
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 500) || '알 수 없는 오류';
};

export class UpdateService extends EventEmitter {
  private readonly options: UpdateServiceOptions;
  private readonly settingsPath: string;
  private readonly unavailableMessage: string | null;
  private value: UpdateState;
  private adapter: UpdateAdapter | null = null;
  private loading: Promise<UpdateAdapter> | null = null;
  private checkRequest: Promise<UpdateState> | null = null;
  private downloadRequest: Promise<UpdateState> | null = null;
  private installRequest: Promise<void> | null = null;
  private adapterListeners: Array<[string, (...values: any[]) => void]> = [];
  private started = false;
  private disposed = false;
  private downloaded = false;
  private installing = false;
  private installationError: Error | null = null;
  private releaseAbort: AbortController | null = null;
  private releaseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: UpdateServiceOptions) {
    super();
    this.options = options;
    this.settingsPath = join(options.directory, 'update-settings.json');
    let autoCheck = true;
    try {
      if (existsSync(this.settingsPath) && statSync(this.settingsPath).size <= 64000) {
        const saved: unknown = JSON.parse(readFileSync(this.settingsPath, 'utf8'));
        if (saved && typeof saved === 'object' && 'autoCheck' in saved && typeof saved.autoCheck === 'boolean') autoCheck = saved.autoCheck;
      }
    } catch (error) { this.log(`업데이트 설정 읽기 실패: ${detail(error)}`); }
    // electron-builder's NSIS uninstaller is installed beside the app executable.
    // A ZIP extraction has no uninstaller and must first migrate using the release installer.
    const appDirectory = dirname(options.executablePath);
    const installed = ['Uninstall Kitvi.exe', 'UninstallKitvi.exe'].some((name) => isFile(join(appDirectory, name)));
    this.unavailableMessage = !options.isPackaged
      ? '개발 실행에서는 자동 업데이트를 사용할 수 없습니다. GitHub Releases에서 설치 파일을 확인하세요.'
      : !installed
        ? '포터블 ZIP은 자동 설치를 지원하지 않습니다. GitHub Releases의 Kitvi 설치 파일로 전환하세요. 기존 0.3.0도 처음 한 번은 직접 설치해야 합니다.'
        : !isFile(join(options.resourcesPath, 'app-update.yml'))
          ? '업데이트 구성 파일이 없습니다. GitHub Releases에서 최신 Kitvi 설치 파일을 다시 설치하세요.'
          : null;
    this.value = {
      phase: options.isPackaged ? 'idle' : 'disabled', currentVersion: options.currentVersion,
      availableVersion: null, autoCheck, checkedAt: null, progress: null,
      message: this.unavailableMessage, canInstall: !this.unavailableMessage, releaseUrl: RELEASE_URL,
    };
  }

  get state(): UpdateState { return { ...this.value }; }

  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    // This microtask is guarded, so immediate shutdown never begins a network request.
    if (this.value.autoCheck && this.options.isPackaged) queueMicrotask(() => {
      if (!this.disposed && this.value.autoCheck) void this.check();
    });
  }

  setAutoCheck(value: boolean): UpdateState {
    if (this.disposed) return this.state;
    if (typeof value !== 'boolean') { this.patch({ message: '자동 확인 설정값이 올바르지 않습니다.' }); return this.state; }
    try {
      mkdirSync(this.options.directory, { recursive: true });
      const temporary = this.settingsPath + '.tmp';
      writeFileSync(temporary, JSON.stringify({ schemaVersion: 1, autoCheck: value }, null, 2), 'utf8');
      renameSync(temporary, this.settingsPath);
      this.patch({ autoCheck: value });
    } catch (error) {
      const message = `자동 확인 설정을 저장하지 못했습니다. ${detail(error)}`;
      this.log(message);
      this.patch({ message });
    }
    return this.state;
  }

  check(): Promise<UpdateState> {
    if (this.disposed || !this.options.isPackaged) return Promise.resolve(this.state);
    if (this.downloadRequest || this.downloaded) return Promise.resolve(this.state);
    if (!this.checkRequest) this.checkRequest = this.performCheck().finally(() => {
      this.checkRequest = null;
      this.finishDisposal();
    });
    return this.checkRequest;
  }

  download(): Promise<UpdateState> {
    if (this.disposed || !this.value.canInstall || this.downloaded) return Promise.resolve(this.state);
    if (!this.downloadRequest) this.downloadRequest = this.performDownload().finally(() => {
      this.downloadRequest = null;
      this.finishDisposal();
    });
    return this.downloadRequest;
  }

  install(): Promise<void> {
    if (this.installing && !this.installRequest) return Promise.resolve();
    if (!this.installRequest) this.installRequest = this.performInstall().finally(() => { this.installRequest = null; });
    return this.installRequest;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.releaseAbort?.abort();
    if (this.releaseTimer) { clearTimeout(this.releaseTimer); this.releaseTimer = null; }
    this.removeAllListeners();
    this.finishDisposal();
  }

  private async performCheck(): Promise<UpdateState> {
    this.patch({ phase: 'checking', progress: null, message: 'GitHub Releases에서 새 버전을 확인하고 있습니다.' });
    try {
      if (!this.value.canInstall) return await this.checkReleases();
      const updater = await this.getUpdater();
      if (this.disposed) return this.state;
      const result = await updater.checkForUpdates();
      if (this.disposed) return this.state;
      if (this.value.phase === 'checking') {
        if (!result) return this.fail('업데이트 확인을 시작하지 못했습니다. GitHub Releases에서 직접 확인하세요.', true);
        if (result.isUpdateAvailable) this.available(result.updateInfo);
        else this.notAvailable();
      }
    } catch (error) { this.fail(`업데이트를 확인하지 못했습니다. ${detail(error)}`, true); }
    return this.state;
  }

  private async checkReleases(): Promise<UpdateState> {
    const controller = new AbortController();
    let timedOut = false;
    this.releaseAbort = controller;
    this.releaseTimer = setTimeout(() => { timedOut = true; controller.abort(); }, 10000);
    try {
      const response = await (this.options.releaseFetch ?? fetch)(RELEASE_API, {
        signal: controller.signal, redirect: 'error', headers: { Accept: 'application/vnd.github+json', 'User-Agent': `Kitvi/${this.options.currentVersion}` },
      });
      if (!response.ok) { controller.abort(); throw new Error(`GitHub 응답 ${response.status}. 잠시 뒤 다시 확인하거나 릴리스 페이지를 열어 주세요.`); }
      const contentLength = Number(response.headers.get('content-length'));
      if (contentLength > MAX_RELEASE_BYTES) { controller.abort(); throw new Error('GitHub 릴리스 응답 크기가 허용 범위를 넘었습니다.'); }
      const reader = response.body?.getReader();
      if (!reader) throw new Error('GitHub 릴리스 응답 본문이 없습니다.');
      const chunks: Uint8Array[] = []; let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_RELEASE_BYTES) { controller.abort(); throw new Error('GitHub 릴리스 응답 크기가 허용 범위를 넘었습니다.'); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      if (this.disposed) return this.state;
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      const releases: unknown = JSON.parse(new TextDecoder().decode(bytes));
      if (!Array.isArray(releases) || releases.length > 100) throw new Error('GitHub 릴리스 응답 형식이 올바르지 않습니다.');
      const current = semver.valid(this.options.currentVersion);
      if (!current) throw new Error('현재 앱 버전을 확인하지 못했습니다. 릴리스 페이지에서 직접 확인하세요.');
      const versions = releases.flatMap((release: unknown) => {
        if (!release || typeof release !== 'object' || !('tag_name' in release) || typeof release.tag_name !== 'string' || ('draft' in release && release.draft === true)) return [];
        const version = semver.valid(release.tag_name);
        return version && semver.gt(version, current) ? [version] : [];
      }).sort(semver.rcompare);
      if (versions[0]) this.available({ version: versions[0] });
      else this.notAvailable();
      return this.state;
    } catch (error) {
      const message = timedOut && !this.disposed ? '확인 시간이 초과되었습니다. 잠시 뒤 다시 시도하세요.' : detail(error);
      return this.fail(`업데이트를 확인하지 못했습니다. ${message}`, true);
    } finally {
      if (this.releaseTimer) { clearTimeout(this.releaseTimer); this.releaseTimer = null; }
      if (this.releaseAbort === controller) this.releaseAbort = null;
    }
  }

  private async performDownload(): Promise<UpdateState> {
    if (this.checkRequest) await this.checkRequest;
    if (this.disposed) return this.state;
    if (!this.value.availableVersion) return this.fail('먼저 업데이트를 확인한 뒤 새 버전을 다운로드하세요.');
    this.patch({ phase: 'downloading', progress: 0, message: '업데이트 설치 파일을 다운로드하고 있습니다.' });
    try {
      const updater = await this.getUpdater();
      if (this.disposed) return this.state;
      await updater.downloadUpdate();
      // A resolved download without update-downloaded must never enable installation.
      if (!this.disposed && !this.downloaded && this.value.phase === 'downloading') this.fail('업데이트 다운로드 완료를 확인하지 못했습니다. 다시 시도하세요.');
    } catch (error) { this.fail(`업데이트를 다운로드하지 못했습니다. ${detail(error)}`); }
    return this.state;
  }

  private async performInstall(): Promise<void> {
    const refuse = (message: string): never => { this.patch({ message }); throw new Error(message); };
    if (this.disposed) throw new Error('업데이트 서비스가 종료되었습니다.');
    if (!this.value.canInstall) refuse(this.unavailableMessage || 'GitHub Releases에서 설치 파일을 확인하세요.');
    if (!this.downloaded || this.value.phase !== 'downloaded') refuse('업데이트 다운로드가 완료된 뒤 다시 시작할 수 있습니다.');
    if (this.options.isBusy()) refuse('진행 중인 미디어 다운로드 작업이 있습니다. 작업을 마치거나 취소한 뒤 다시 시작하세요.');
    this.installationError = null;
    this.installing = true;
    try {
      await this.options.beforeInstall();
      if (this.disposed) throw new Error('업데이트 서비스가 종료되었습니다.');
      if (this.installationError) throw this.installationError;
      // A job can start while asynchronous host cleanup is finishing.
      if (this.options.isBusy()) refuse('진행 중인 미디어 작업이 있습니다. 작업을 마치거나 취소한 뒤 다시 시작하세요.');
      this.patch({ message: '업데이트를 설치하기 위해 Kitvi를 다시 시작합니다.' });
      this.adapter!.quitAndInstall(false, true);
      // NSIS can report a synchronous error event instead of throwing.
      if (this.installationError) throw this.installationError;
    } catch (error) {
      throw this.installationFailed(error);
    }
  }

  private installationFailed(error: unknown): Error {
    if (this.installationError) return this.installationError;
    const failure = new Error(`다시 시작하지 못했습니다. ${detail(error)}`, { cause: error });
    this.installationError = failure;
    this.installing = false;
    this.log(failure.message);
    this.patch({ phase: 'downloaded', progress: 100, message: failure.message });
    // Main releases its new-work lock through this event, including a failure
    // emitted after quitAndInstall has returned. The cached update stays usable.
    if (!this.disposed) this.emit('install-failed', failure);
    return failure;
  }

  private getUpdater(): Promise<UpdateAdapter> {
    if (this.adapter) return Promise.resolve(this.adapter);
    if (!this.loading) this.loading = (async () => {
      // Keep electron-updater external in the main-process bundle. Loading lazily also
      // permits Node-native controller tests without importing Electron's runtime API.
      const updater = this.options.updater ?? ((await import('electron-updater')).default.autoUpdater as unknown as UpdateAdapter);
      if (this.disposed) throw new Error('업데이트 서비스가 종료되었습니다.');
      updater.autoDownload = false;
      updater.autoInstallOnAppQuit = false;
      updater.allowPrerelease = true;
      updater.allowDowngrade = false;
      const log = (...values: unknown[]) => this.log(values.map((value) => detail(value)).join(' '));
      updater.logger = { info: log, warn: log, error: log, debug: log };
      this.adapter = updater;
      this.listen('error', (error: unknown) => {
        if (this.installing || this.installationError) this.installationFailed(error);
        else this.fail(`업데이트 처리 중 오류가 발생했습니다. ${detail(error)}`, this.value.phase === 'checking');
      });
      this.listen('checking-for-update', () => {
        if (!this.downloaded && this.value.phase !== 'downloading') this.patch({ phase: 'checking', message: 'GitHub Releases에서 새 버전을 확인하고 있습니다.' });
      });
      this.listen('update-available', (info: UpdateInfo) => this.available(info));
      this.listen('update-not-available', () => this.notAvailable());
      this.listen('download-progress', (progress: { percent: number }) => {
        if (this.value.phase === 'downloading' && Number.isFinite(progress?.percent)) this.patch({ progress: Math.max(0, Math.min(100, progress.percent)) });
      });
      this.listen('update-downloaded', (info: UpdateInfo) => {
        if (this.disposed) return;
        this.downloaded = true;
        this.patch({ phase: 'downloaded', availableVersion: this.version(info) || this.value.availableVersion, progress: 100, message: '업데이트가 준비되었습니다. 진행 중인 작업을 마친 뒤 다시 시작하여 설치하세요.' });
      });
      this.listen('update-cancelled', () => {
        this.patch({ phase: this.value.availableVersion ? 'available' : 'idle', progress: null, message: '업데이트 다운로드가 취소되었습니다. 다시 다운로드할 수 있습니다.' });
      });
      return updater;
    })().catch((error: unknown) => { this.loading = null; throw error; });
    return this.loading;
  }

  private version(info: UpdateInfo): string | null { return info && typeof info.version === 'string' && info.version.trim() ? info.version.trim().slice(0, 100) : null; }
  private available(info: UpdateInfo): void {
    const version = this.version(info);
    if (!version) { this.fail('업데이트 버전 정보가 올바르지 않습니다.', true); return; }
    this.patch({ phase: 'available', availableVersion: version, progress: null, checkedAt: new Date().toISOString(), message: this.value.canInstall ? `Kitvi ${version} 업데이트를 다운로드할 수 있습니다.` : `Kitvi ${version} 새 버전이 있습니다. GitHub Releases에서 설치 파일을 받아 전환하세요. 포터블 ZIP은 앱 안에서 설치하지 않습니다.` });
  }
  private notAvailable(): void {
    this.patch({ phase: 'up-to-date', availableVersion: null, progress: null, checkedAt: new Date().toISOString(), message: '현재 버전이 최신입니다.' });
  }
  private listen(event: string, listener: (...values: any[]) => void): void {
    const guarded = (...values: any[]) => { if (!this.disposed) listener(...values); };
    this.adapterListeners.push([event, guarded]);
    this.adapter!.on(event, guarded);
  }
  private finishDisposal(): void {
    if (!this.disposed || !this.adapter) return;
    // Keep the inert error handler until in-flight promises settle: EventEmitter
    // would otherwise throw an unhandled late error during app shutdown.
    const pending = !!this.checkRequest || !!this.downloadRequest;
    this.adapterListeners = this.adapterListeners.filter(([event, listener]) => {
      if (pending && event === 'error') return true;
      this.adapter!.removeListener(event, listener);
      return false;
    });
  }
  private fail(message: string, checked = false): UpdateState {
    this.log(message);
    this.patch({ phase: 'error', progress: null, message, ...(checked ? { checkedAt: new Date().toISOString() } : {}) });
    return this.state;
  }
  private patch(patch: Partial<UpdateState>): void {
    if (this.disposed) return;
    this.value = { ...this.value, ...patch };
    this.emit('state', this.state);
  }
  private log(message: string): void { try { this.options.log(`[updater] ${message}`); } catch { /* Logging must not break the updater. */ } }
}
