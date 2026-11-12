import { EventEmitter } from 'node:events';
import { spawn as nodeSpawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, constants } from 'node:fs';
import { mkdir, readFile, writeFile, rename, rm, stat, link, copyFile, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import type { MediaInfo, MediaJob, MediaMode, MediaState } from '../shared/features.ts';

const RELEASE_API = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest';
const ENGINE_LIMIT = 128 * 1024 * 1024;
const DOWNLOAD_LIMIT = 2 * 1024 * 1024 * 1024;
const META_LIMIT = 4 * 1024 * 1024;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const trim = (value: unknown, length: number): string => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, length) : '';
const positive = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

export function canonicalizeYouTubeUrl(input: string): string {
  if (typeof input !== 'string' || input.length > 2048) throw new Error('YouTube 영상 주소를 확인해 주세요.');
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error('올바른 YouTube 주소를 입력해 주세요.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('HTTPS YouTube 영상 주소만 지원합니다.');
  const host = url.hostname.toLowerCase(); let id: string | null = null;
  if (host === 'youtu.be') id = url.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/)?.[1] ?? null;
  else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host)) {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else id = url.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})\/?$/)?.[1] ?? null;
  }
  if (!id || !VIDEO_ID.test(id)) throw new Error('YouTube 개별 영상(watch, youtu.be, shorts)만 지원합니다.');
  return `https://www.youtube.com/watch?v=${id}`;
}

function baseArgs(runtimeExecutable: string): string[] {
  return ['--ignore-config', '--no-plugin-dirs', '--no-remote-components', '--no-js-runtimes', '--js-runtimes', `node:${runtimeExecutable}`, '--no-playlist', '--no-warnings', '--no-colors', '--use-extractors', 'youtube', '--socket-timeout', '20', '--retries', '2', '--fragment-retries', '2', '--no-cache-dir'];
}

export function buildMediaArgs(runtimeExecutable: string, options: { url: string; mode: MediaMode; directory: string; jobId: string }): string[] {
  if (options.mode !== 'video' && options.mode !== 'audio') throw new Error('지원하지 않는 다운로드 형식입니다.');
  if (!/^[A-Za-z0-9-]{1,64}$/.test(options.jobId)) throw new Error('작업 ID가 올바르지 않습니다.');
  return [...baseArgs(runtimeExecutable), '--no-simulate', '--no-overwrites', '--no-continue', '--match-filters', '!is_live & live_status!=is_upcoming', '--restrict-filenames', '--windows-filenames', '--trim-filenames', '160', '--max-filesize', String(DOWNLOAD_LIMIT), '--abort-on-unavailable-fragments', '--newline', '--progress', '--progress-delta', '0.3', '--progress-template', 'download:KITVI_PROGRESS:%(progress)j', '--print', 'after_move:KITVI_FILE:%(filepath)j', '--print', 'after_video:KITVI_TITLE:%(title)j', '--format', options.mode === 'video' ? 'best[ext=mp4]/best' : 'bestaudio[ext=m4a]/bestaudio', '--output', join(options.directory, `%(title).80B [%(id)s]-${options.jobId}.%(ext)s`), '--', canonicalizeYouTubeUrl(options.url)];
}

export function parseMediaProgress(line: string): Pick<MediaJob, 'downloadedBytes' | 'totalBytes' | 'progress' | 'speed' | 'eta'> | null {
  if (!line.startsWith('KITVI_PROGRESS:') || line.length > 65536) return null;
  try {
    const value = JSON.parse(line.slice(15));
    const downloadedBytes = positive(value.downloaded_bytes) ?? 0;
    const totalBytes = positive(value.total_bytes) ?? positive(value.total_bytes_estimate);
    return { downloadedBytes, totalBytes, progress: totalBytes && totalBytes > 0 ? Math.min(100, downloadedBytes / totalBytes * 100) : null, speed: positive(value.speed), eta: positive(value.eta) };
  } catch { return null; }
}

interface EngineMetadata { version: string; sha256: string }
interface Options {
  directory: string; runtimeExecutable: string; log: (message: string) => void;
  fetch?: typeof globalThis.fetch;
  spawn?: (file: string, args: string[], options: { shell: false; windowsHide: true; stdio: ['ignore', 'pipe', 'pipe']; env: NodeJS.ProcessEnv; cwd: string }) => ChildProcess;
}
interface Running { child: ChildProcess; done: Promise<void>; kill: (reason: string) => Promise<void> }

async function sha256(file: string): Promise<string> {
  const hash = createHash('sha256'); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest('hex');
}

export class MediaService extends EventEmitter {
  private readonly options: Options;
  private readonly enginePath: string;
  private engine: MediaState['engine'] = { phase: 'missing', version: null, progress: null, message: null };
  private metadata: EngineMetadata | null = null;
  private jobs: MediaJob[] = [];
  private processes = new Map<string, Running>();
  private finalizing = new Map<string, Promise<void>>();
  private starting = new Set<string>();
  private loading: Promise<void>;
  private installing: Promise<MediaState> | null = null;
  private stopped = false;
  private installAbort: AbortController | null = null;
  constructor(options: Options) {
    super(); this.options = options; this.enginePath = join(options.directory, 'yt-dlp.exe'); this.loading = this.loadCache();
  }
  snapshot(pluginId: string): MediaState { return structuredClone({ engine: this.engine, jobs: this.jobs.filter((job) => job.pluginId === pluginId), folder: null }); }
  private changed(): void { this.emit('state'); this.emit('changed'); }
  private async loadCache(): Promise<void> {
    try {
      const file = await readFile(join(this.options.directory, 'engine.json'), 'utf8'); if (file.length > 4096) return;
      const value = JSON.parse(file);
      if (!/^[a-f0-9]{64}$/.test(value.sha256) || !/^[A-Za-z0-9._-]{1,64}$/.test(value.version)) return;
      if (await sha256(this.enginePath) !== value.sha256) throw new Error('설치된 엔진 SHA256 검증에 실패했습니다. 엔진을 다시 설치해 주세요.');
      this.metadata = { sha256: value.sha256, version: value.version }; this.engine = { phase: 'ready', version: value.version, progress: 100, message: null }; this.changed();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { this.engine = { phase: 'error', version: null, progress: null, message: trim((error as Error).message, 300) }; this.changed(); }
    }
  }
  async ensureEngine(): Promise<MediaState> {
    await this.loading; if (this.stopped) throw new Error('앱을 종료하고 있습니다.');
    if (this.engine.phase === 'ready') { await this.requireEngine(); return this.snapshot(''); }
    if (this.installing) return this.installing;
    this.installing = this.installEngine();
    try { return await this.installing; } finally { this.installing = null; }
  }
  private async fetchBytes(url: string, limit: number, controller: AbortController, progress?: (value: number) => void): Promise<Buffer> {
    const timer = setTimeout(() => controller.abort(), 120000);
    try {
      const response = await (this.options.fetch ?? globalThis.fetch)(url, { signal: controller.signal, headers: { 'User-Agent': 'Kitvi/0.4.0', Accept: 'application/vnd.github+json' } });
      if (!response.ok || !response.body) throw new Error(`공식 배포처 응답 오류 (${response.status}).`);
      if (response.url) { const final = new URL(response.url); if (final.protocol !== 'https:' || !['api.github.com', 'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(final.hostname)) throw new Error('공식 배포 주소가 아닙니다.'); }
      const total = Number(response.headers.get('content-length')) || null; if (total && total > limit) throw new Error('엔진 다운로드 크기 제한을 초과했습니다.');
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) { size += chunk.length; if (size > limit) { controller.abort(); throw new Error('다운로드 크기 제한을 초과했습니다.'); } chunks.push(Buffer.from(chunk)); if (total) progress?.(Math.min(99, size / total * 100)); }
      return Buffer.concat(chunks);
    } finally { clearTimeout(timer); }
  }
  private async installEngine(): Promise<MediaState> {
    const controller = new AbortController(); this.installAbort = controller;
    const temporary = `${this.enginePath}.${randomUUID()}.tmp`; const metadataTemporary = `${temporary}.json`;
    this.engine = { phase: 'installing', version: null, progress: 0, message: '공식 yt-dlp 엔진을 다운로드하고 있습니다.' }; this.changed();
    try {
      await mkdir(this.options.directory, { recursive: true });
      const release = JSON.parse((await this.fetchBytes(RELEASE_API, 1024 * 1024, controller)).toString('utf8'));
      if (!/^[A-Za-z0-9._-]{1,64}$/.test(release.tag_name) || !Array.isArray(release.assets)) throw new Error('공식 엔진 배포 정보를 확인할 수 없습니다.');
      const releaseBase = `https://github.com/yt-dlp/yt-dlp/releases/download/${release.tag_name}/`;
      for (const name of ['yt-dlp.exe', 'SHA2-256SUMS']) if (!release.assets.some((asset: { name?: string; browser_download_url?: string }) => asset.name === name && asset.browser_download_url === releaseBase + name)) throw new Error('공식 엔진 또는 체크섬 파일이 없습니다.');
      const sums = (await this.fetchBytes(`${releaseBase}SHA2-256SUMS`, 1024 * 1024, controller)).toString('utf8');
      const hashes = sums.split(/\r?\n/).map((line) => /^([a-fA-F0-9]{64})\s+\*?yt-dlp\.exe$/.exec(line)).filter((value) => value !== null);
      if (hashes.length !== 1) throw new Error('공식 yt-dlp.exe SHA256을 확인할 수 없습니다.');
      const binary = await this.fetchBytes(`${releaseBase}yt-dlp.exe`, ENGINE_LIMIT, controller, (progress) => { this.engine.progress = progress; this.changed(); });
      const expected = hashes[0]![1]!.toLowerCase();
      if (binary.subarray(0, 2).toString('ascii') !== 'MZ' || createHash('sha256').update(binary).digest('hex') !== expected) throw new Error('다운로드한 엔진 SHA256 검증에 실패했습니다.');
      if (this.stopped) throw new Error('앱을 종료하고 있습니다.');
      await writeFile(temporary, binary, { flag: 'wx' }); const metadata = { version: release.tag_name as string, sha256: expected }; await writeFile(metadataTemporary, JSON.stringify(metadata), { flag: 'wx' });
      await rename(temporary, this.enginePath); await rename(metadataTemporary, join(this.options.directory, 'engine.json'));
      this.metadata = metadata; this.engine = { phase: 'ready', version: metadata.version, progress: 100, message: null }; this.changed(); return this.snapshot('');
    } catch (error) { this.engine = { phase: 'error', version: null, progress: null, message: trim((error as Error).message, 300) }; this.changed(); throw error; }
    finally { this.installAbort = null; await Promise.all([rm(temporary, { force: true }), rm(metadataTemporary, { force: true })]); }
  }
  private async requireEngine(): Promise<void> {
    await this.loading; if (this.stopped) throw new Error('앱을 종료하고 있습니다.');
    if (this.engine.phase !== 'ready' || !this.metadata) throw new Error('먼저 공식 yt-dlp 엔진을 설치해 주세요.');
    if (await sha256(this.enginePath) !== this.metadata.sha256) { this.engine.phase = 'error'; this.engine.message = '설치된 엔진 SHA256 검증에 실패했습니다. 다시 설치해 주세요.'; this.changed(); throw new Error(this.engine.message); }
  }
  private execute(key: string, args: string[], timeout: number, onLine: (line: string) => void, outputLimit = META_LIMIT): { completion: Promise<void>; running: Running } {
    if (this.stopped || this.processes.size >= 3) throw new Error('다른 작업이 끝난 뒤 다시 시도해 주세요.');
    const child = (this.options.spawn ?? nodeSpawn)(this.enginePath, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, cwd: this.options.directory });
    let stderr = ''; let buffer = ''; let outputSize = 0; let failure: string | null = null; let settled = false;
    let finish!: (error?: Error) => void; const completion = new Promise<void>((done, reject) => { finish = (error) => error ? reject(error) : done(); });
    let markDone!: () => void; const done = new Promise<void>((resolveDone) => { markDone = resolveDone; });
    const close = (code: number | null, error?: Error) => { if (settled) return; settled = true; clearTimeout(timer); if (buffer) onLine(buffer); this.processes.delete(key); markDone(); finish(error ?? (failure ? new Error(failure) : code === 0 ? undefined : new Error(trim(stderr, 500) || `yt-dlp 작업이 종료되었습니다 (${code ?? '?'}).`))); };
    const running: Running = { child, done, kill: async (reason) => {
      failure ??= reason;
      if (process.platform === 'win32' && child.pid && Number.isSafeInteger(child.pid)) {
        await new Promise<void>((finished) => { const killer = nodeSpawn(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' }); const deadline = setTimeout(() => { killer.kill(); finished(); }, 3000); const complete = () => { clearTimeout(deadline); finished(); }; killer.once('error', complete); killer.once('close', complete); });
      }
      child.kill('SIGKILL'); const force = setTimeout(() => close(1), 1000); await done; clearTimeout(force);
    } };
    const timer = setTimeout(() => { void running.kill('작업 제한 시간을 초과했습니다.'); }, timeout); this.processes.set(key, running);
    child.stdout?.on('data', (chunk: Buffer) => { outputSize += chunk.length; if (outputSize > outputLimit) { void running.kill('엔진 응답 크기 제한을 초과했습니다.'); return; } buffer += chunk.toString('utf8'); const lines = buffer.split(/\r?\n/); buffer = lines.pop() ?? ''; for (const line of lines) onLine(line); if (buffer.length > META_LIMIT) void running.kill('엔진 응답 크기 제한을 초과했습니다.'); });
    child.stderr?.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString('utf8')).slice(-2000); }); child.once('error', (error) => close(1, error)); child.once('close', (code) => close(code));
    return { completion, running };
  }
  async analyze(pluginId: string, input: string): Promise<MediaInfo> {
    const url = canonicalizeYouTubeUrl(input); await this.requireEngine(); let json = '';
    const { completion } = this.execute(`${pluginId}:analyze:${randomUUID()}`, [...baseArgs(this.options.runtimeExecutable), '--skip-download', '--dump-single-json', '--', url], 90000, (line) => { json += line; });
    await completion; let value;
    try { value = JSON.parse(json); } catch { throw new Error('영상 정보를 읽지 못했습니다.'); }
    if (!VIDEO_ID.test(value.id) || value.id !== new URL(url).searchParams.get('v')) throw new Error('영상 정보가 요청한 영상과 일치하지 않습니다.');
    if (value.is_live || value.live_status === 'is_live' || value.live_status === 'is_upcoming') throw new Error('라이브 또는 예정 영상은 지원하지 않습니다.');
    return { id: value.id, title: trim(value.title, 300) || value.id, duration: positive(value.duration), uploader: trim(value.uploader, 120) || null, thumbnail: null };
  }
  async start(pluginId: string, options: { url: string; mode: MediaMode; directory: string }): Promise<MediaJob> {
    if (this.starting.has(pluginId)) throw new Error('다운로드를 준비하고 있습니다.');
    this.starting.add(pluginId);
    try { return await this.startJob(pluginId, options); } finally { this.starting.delete(pluginId); }
  }
  private async startJob(pluginId: string, options: { url: string; mode: MediaMode; directory: string }): Promise<MediaJob> {
    const url = canonicalizeYouTubeUrl(options.url); if (options.mode !== 'video' && options.mode !== 'audio') throw new Error('지원하지 않는 다운로드 형식입니다.');
    await this.requireEngine(); if (!isAbsolute(options.directory) || !(await stat(options.directory)).isDirectory()) throw new Error('저장 폴더를 다시 선택해 주세요.');
    if (this.jobs.some((job) => job.pluginId === pluginId && (job.phase === 'running' || job.phase === 'queued'))) throw new Error('진행 중인 다운로드를 먼저 완료하거나 취소해 주세요.');
    const id = randomUUID(); const staging = join(options.directory, `.kitvi-${id}`); await mkdir(staging, { recursive: false });
    const job: MediaJob = { id, pluginId, title: new URL(url).searchParams.get('v')!, url, mode: options.mode, phase: 'running', progress: null, downloadedBytes: 0, totalBytes: null, speed: null, eta: null, filename: null, error: null, startedAt: new Date().toISOString() };
    let candidate: string | null = null; let published: string | null = null;
    const cancelled = (): boolean => job.phase === 'cancelled' || this.stopped;
    try {
      const { completion, running } = this.execute(id, buildMediaArgs(this.options.runtimeExecutable, { ...options, url, directory: staging, jobId: id }), 2 * 60 * 60 * 1000, (line) => {
        const progress = parseMediaProgress(line); if (progress) { Object.assign(job, progress); if (progress.downloadedBytes > DOWNLOAD_LIMIT || (progress.totalBytes ?? 0) > DOWNLOAD_LIMIT) { job.error = '다운로드는 2 GB까지 지원합니다.'; void running.kill(job.error); } this.changed(); }
        if (line.startsWith('KITVI_FILE:')) { try { const file = JSON.parse(line.slice(11)); if (typeof file === 'string' && dirname(resolve(file)) === resolve(staging) && basename(file).includes(id)) candidate = resolve(file); } catch { /* invalid output ignored */ } }
        if (line.startsWith('KITVI_TITLE:')) { try { job.title = trim(JSON.parse(line.slice(12)), 300) || job.title; } catch { /* invalid output ignored */ } }
      }, 32 * 1024 * 1024);
      this.jobs.unshift(job); this.jobs = this.jobs.filter((item, index) => index < 100 || item.phase === 'running' || item.phase === 'queued'); this.changed();
      const finalizing = completion.then(async () => {
        if (cancelled()) return;
        if (!candidate) throw new Error('다운로드한 파일을 확인할 수 없습니다.');
        const details = await stat(candidate); if (!details.isFile() || details.size > DOWNLOAD_LIMIT) throw new Error('다운로드는 2 GB까지 지원합니다.');
        if (cancelled()) return;
        const destination = join(options.directory, basename(candidate));
        try { await link(candidate, destination); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('같은 이름의 파일이 있어 저장하지 않았습니다.'); if (cancelled()) return; await copyFile(candidate, destination, constants.COPYFILE_EXCL); }
        published = destination;
        if (cancelled()) return;
        await unlink(candidate);
        if (cancelled()) return;
        job.filename = destination; job.phase = 'completed'; job.progress = 100; job.speed = null; job.eta = null;
      }).catch((error: Error) => { if (job.phase !== 'cancelled') { job.phase = 'error'; job.error = trim(error.message, 500); } }).finally(async () => {
        // Only a destination created successfully with exclusive semantics is ours.
        // Existing destination files never enter this cleanup path.
        if (published && job.phase !== 'completed') await rm(published, { force: true }).catch(() => {});
        await rm(staging, { recursive: true, force: true }).catch(() => {}); this.finalizing.delete(id); this.changed();
      });
      this.finalizing.set(id, finalizing);
      return structuredClone(job);
    } catch (error) { await rm(staging, { recursive: true, force: true }); throw error; }
  }
  async cancel(pluginId: string, jobId: string): Promise<void> {
    const job = this.jobs.find((item) => item.id === jobId && item.pluginId === pluginId); if (!job) throw new Error('다운로드 작업을 찾을 수 없거나 권한이 없습니다.');
    if (job.phase !== 'queued' && job.phase !== 'running') { await this.finalizing.get(jobId); return; }
    job.phase = 'cancelled'; job.speed = null; job.eta = null; this.changed(); await this.processes.get(jobId)?.kill('사용자가 다운로드를 취소했습니다.'); await this.finalizing.get(jobId);
  }
  hasActiveJobs(): boolean { return this.processes.size > 0 || this.finalizing.size > 0 || this.starting.size > 0 || this.engine.phase === 'installing'; }
  async stop(): Promise<void> { this.stopped = true; this.installAbort?.abort(); for (const job of this.jobs) if (job.phase === 'running' || job.phase === 'queued') job.phase = 'cancelled'; await Promise.all([...this.processes.values()].map((running) => running.kill('앱을 종료하고 있습니다.'))); await Promise.all([...this.finalizing.values()]); if (this.installing) await this.installing.catch(() => {}); }
}
