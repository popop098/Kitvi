import { EventEmitter } from 'node:events';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import yauzl from 'yauzl';
import semver from 'semver';
import type { InstalledPlugin, PluginManifest, PluginPreview, PluginState } from '../shared/features.ts';
import { validateArchivePath, validatePluginId, validatePluginManifest } from '../shared/plugin-schema.ts';
import { themeResourceReferences, validateThemeDefinition } from '../shared/theme-schema.ts';
import type { ThemeDefinition } from '../shared/themes.ts';

const ARCHIVE_LIMIT = 16 * 1024 * 1024;
const FILE_LIMIT = 4 * 1024 * 1024;
const FONT_LIMIT = 2 * 1024 * 1024;
const STORAGE_LIMIT = 64 * 1024;
const PREVIEW_TTL = 10 * 60 * 1000;
const assetName = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}\.kitvi-plugin\.zip$/;
const mimeTypes: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8' };
type Integrity = { treeHash: string; files: Record<string, string> };
type Consent = Pick<InstalledPlugin, 'version' | 'contentHash' | 'source' | 'author' | 'authorEmail' | 'permissions' | 'apiVersion' | 'kind'> & { acceptedAt: string };
type UpdateBinding = Pick<InstalledPlugin, 'id' | 'source' | 'version' | 'contentHash'>;
type Pending = { token: string; manifest: PluginManifest; source: string; contentHash: string; integrity: Integrity; directory: string; expires: number; update?: UpdateBinding };
export interface PluginManagerOptions { directory: string; appVersion: string; log: (message: string) => void; beforeCommit?: () => void }

function message(error: unknown): string { return error instanceof Error ? error.message : 'Plugin operation failed.'; }
function within(parent: string, target: string): boolean { const relative = path.relative(parent, target); return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)); }
function assertNoLinks(target: string): void {
  const absolute = path.resolve(target); let cursor = path.parse(absolute).root;
  for (const segment of absolute.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    try { if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('Symbolic links and junctions are not allowed in plugin storage.'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}
function ensureDirectory(target: string): void { assertNoLinks(target); fs.mkdirSync(target, { recursive: true }); assertNoLinks(target); if (!fs.lstatSync(target).isDirectory()) throw new Error('Plugin storage path is not a directory.'); }
function safeChild(parent: string, relative: string): string {
  const target = path.resolve(parent, relative);
  if (!within(parent, target) || target === parent) throw new Error('Plugin path leaves its storage directory.');
  assertNoLinks(parent); assertNoLinks(target); return target;
}
function readLimited(file: string, limit: number): Buffer {
  assertNoLinks(file); const fd = fs.openSync(file, 'r');
  try {
    const stat = fs.fstatSync(fd); if (!stat.isFile() || stat.size > limit) throw new Error('Plugin file exceeds the size limit.');
    const chunks: Buffer[] = []; let length = 0;
    while (true) { const chunk = Buffer.alloc(Math.min(65536, limit + 1 - length)); const count = fs.readSync(fd, chunk); if (!count) break; length += count; if (length > limit) throw new Error('Plugin file exceeds the size limit.'); chunks.push(chunk.subarray(0, count)); }
    return Buffer.concat(chunks, length);
  } finally { fs.closeSync(fd); }
}
function atomicJson(file: string, value: unknown): void {
  assertNoLinks(file); const temporary = `${file}.${randomUUID()}.tmp`;
  try { fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { flag: 'wx', mode: 0o600 }); assertNoLinks(file); fs.renameSync(temporary, file); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
function repositoryId(value: string): string {
  const match = /^(?:https:\/\/github\.com\/)?([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9_.-]{1,100})(?:\.git)?\/?$/.exec(value.trim());
  if (!match || match[2] === '.' || match[2] === '..') throw new Error('Use a GitHub owner/repository or https://github.com/owner/repository URL.');
  return `${match[1]}/${match[2].replace(/\.git$/, '')}`.toLowerCase();
}
function isSource(value: unknown): value is string { return value === 'local' || (typeof value === 'string' && value.startsWith('github:') && (() => { try { return repositoryId(value.slice(7)) === value.slice(7); } catch { return false; } })()); }
function samePublisherAndPermissions(left: PluginManifest, right: Pick<PluginManifest, 'author' | 'authorEmail' | 'permissions' | 'apiVersion' | 'kind'>): boolean {
  return left.apiVersion === right.apiVersion && left.kind === right.kind && left.author === right.author && left.authorEmail === right.authorEmail && left.permissions.length === right.permissions.length && left.permissions.every((permission) => right.permissions.includes(permission));
}
function consentMatches(plugin: InstalledPlugin, consent: Consent | undefined): boolean {
  return !!consent && consent.version === plugin.version && consent.contentHash === plugin.contentHash && consent.source === plugin.source && samePublisherAndPermissions(plugin, consent);
}
function crc32Update(crc: number, data: Buffer): number { for (const byte of data) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return crc >>> 0; }
function fileLimit(name: string): number { return /\.(?:woff2?|ttf|otf)$/i.test(name) ? FONT_LIMIT : FILE_LIMIT; }
function resourceMime(name: string): string {
  const extension = path.posix.extname(name).toLowerCase();
  if (mimeTypes[extension]) return mimeTypes[extension];
  if (/^(?:readme|license|licence|copying|notice)$/i.test(path.posix.basename(name))) return 'text/plain; charset=utf-8';
  throw new Error(`Unsupported plugin file type: ${name}`);
}
function assertAssetSignature(name: string, data: Buffer): void {
  const ext = path.posix.extname(name).toLowerCase(), ascii = (from: number, to: number) => data.toString('ascii', from, to);
  const valid = ext === '.png' ? data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    : ['.jpg', '.jpeg'].includes(ext) ? data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
    : ext === '.gif' ? ['GIF87a', 'GIF89a'].includes(ascii(0, 6))
    : ext === '.webp' ? ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP'
    : ext === '.woff2' ? ascii(0, 4) === 'wOF2' : ext === '.woff' ? ascii(0, 4) === 'wOFF'
    : ext === '.otf' ? ascii(0, 4) === 'OTTO' : ext === '.ttf' ? data.subarray(0, 4).equals(Buffer.from([0, 1, 0, 0])) || ascii(0, 4) === 'true'
    : ext === '.mp3' ? ascii(0, 3) === 'ID3' || (data.length >= 2 && data[0] === 0xff && (data[1] & 0xe0) === 0xe0)
    : ext === '.ogg' ? ascii(0, 4) === 'OggS' : ext === '.wav' ? ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE'
    : ext === '.m4a' ? ascii(4, 8) === 'ftyp' && ['M4A ', 'M4B ', 'isom', 'mp42'].includes(ascii(8, 12)) : false;
  if (!valid) throw new Error(`Theme asset content does not match its declared MIME type: ${name}`);
}
function readTheme(directory: string, manifest: PluginManifest, integrity?: Integrity): ThemeDefinition {
  if (manifest.apiVersion !== 2 || manifest.kind !== 'theme' || !manifest.permissions.includes('theme')) throw new Error('Plugin does not provide a theme.');
  const data = readLimited(safeChild(directory, manifest.theme), 64 * 1024);
  if (integrity && integrity.files[manifest.theme] !== createHash('sha256').update(data).digest('hex')) throw new Error('Theme definition changed; integrity check failed.');
  const definition = validateThemeDefinition(JSON.parse(data.toString('utf8')));
  if (definition.id !== manifest.id) throw new Error('Theme ID must match the package plugin ID.');
  if (definition.bgm && !manifest.permissions.includes('playback')) throw new Error('A theme with BGM must declare the playback permission.');
  for (const reference of themeResourceReferences(definition)) {
    const asset = readLimited(safeChild(directory, reference.path), fileLimit(reference.path));
    if (integrity && integrity.files[reference.path] !== createHash('sha256').update(asset).digest('hex')) throw new Error('Theme asset changed; integrity check failed.');
    assertAssetSignature(reference.path, asset);
  }
  return definition;
}
function treeHash(directory: string, files?: Record<string, string>): string {
  assertNoLinks(directory); const hash = createHash('sha256'); let count = 0, total = 0; const names = new Set<string>();
  const visit = (folder: string, prefix: string) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (++count > 256) throw new Error('Plugin resources contain too many entries.');
      const name = validateArchivePath(`${prefix}${entry.name}`), key = name.toLowerCase();
      if (names.has(key)) throw new Error('Plugin resources contain case-colliding names.'); names.add(key);
      const file = safeChild(folder, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Plugin resources cannot contain links or junctions.');
      if (entry.isDirectory()) { hash.update(`directory:${name}\0`); visit(file, `${name}/`); }
      else if (entry.isFile()) { resourceMime(name); const data = readLimited(file, fileLimit(name)); if ((total += data.length) > ARCHIVE_LIMIT) throw new Error('Plugin resources exceed the size limit.'); hash.update(`file:${name}:${data.length}\0`); hash.update(data); if (files) files[name] = createHash('sha256').update(data).digest('hex'); }
      else throw new Error('Plugin resources cannot contain special files.');
    }
  };
  visit(directory, ''); return hash.digest('hex');
}

async function extractArchive(buffer: Buffer, directory: string): Promise<void> {
  if (buffer.length > ARCHIVE_LIMIT) throw new Error('Plugin archive exceeds 16 MiB.');
  await new Promise<void>((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true }, (openError, zip) => {
      if (openError || !zip) { reject(openError ?? new Error('Cannot open plugin archive.')); return; }
      let settled = false, entries = 0, total = 0; const names = new Set<string>();
      const fail = (error: unknown) => { if (settled) return; settled = true; zip.close(); reject(error); };
      zip.on('error', fail);
      zip.on('end', () => { if (!settled) { settled = true; resolve(); } });
      zip.on('entry', (entry: yauzl.Entry) => {
        try {
          if (++entries > 256) throw new Error('Plugin archive contains too many entries.');
          if (entry.generalPurposeBitFlag & 1 || ![0, 8].includes(entry.compressionMethod)) throw new Error('Encrypted or unsupported plugin archive entry.');
          const isDirectory = entry.fileName.endsWith('/');
          const name = validateArchivePath(isDirectory ? entry.fileName.slice(0, -1) : entry.fileName);
          const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
          if ((mode && mode !== (isDirectory ? 0o040000 : 0o100000)) || (entry.externalFileAttributes & 0x400)) throw new Error('Plugin archives cannot contain links or special files.');
          const key = name.toLowerCase(); if (names.has(key)) throw new Error('Plugin archive contains duplicate or case-colliding paths.'); names.add(key);
          const target = safeChild(directory, name);
          if (isDirectory) { if (entry.uncompressedSize !== 0) throw new Error('Invalid archive directory.'); ensureDirectory(target); zip.readEntry(); return; }
          resourceMime(name);
          if (entry.uncompressedSize > fileLimit(name) || (total += entry.uncompressedSize) > ARCHIVE_LIMIT) throw new Error('Plugin archive expanded size exceeds its limit.');
          ensureDirectory(path.dirname(target));
          zip.openReadStream(entry, (streamError, stream) => {
            if (streamError || !stream) { fail(streamError ?? new Error('Cannot read archive entry.')); return; }
            const chunks: Buffer[] = []; let size = 0, crc = 0xffffffff;
            stream.on('data', (chunk: Buffer) => {
              size += chunk.length;
              if (size > fileLimit(name) || size > entry.uncompressedSize) { stream.destroy(new Error('Plugin archive file exceeds declared size.')); return; }
              chunks.push(chunk); crc = crc32Update(crc, chunk);
            });
            stream.on('error', fail);
            stream.on('end', () => {
              if (settled) return;
              try {
                if (size !== entry.uncompressedSize || ((crc ^ 0xffffffff) >>> 0) !== entry.crc32) throw new Error('Plugin archive checksum or size is invalid.');
                fs.writeFileSync(target, Buffer.concat(chunks, size), { flag: 'wx', mode: 0o600 }); zip.readEntry();
              } catch (error) { fail(error); }
            });
          });
        } catch (error) { fail(error); }
      });
      zip.readEntry();
    });
  });
}

function releaseAssetUrl(raw: unknown, repository: string, expectedName: string): URL {
  if (typeof raw !== 'string') throw new Error('Invalid GitHub release asset URL.');
  const url = new URL(raw); const segments = url.pathname.split('/');
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash || segments.length !== 7 || `${segments[1]}/${segments[2]}`.toLowerCase() !== repository || segments[3] !== 'releases' || segments[4] !== 'download' || !segments[5] || decodeURIComponent(segments[6]) !== expectedName) throw new Error('Release asset must belong to the selected GitHub repository.');
  return url;
}
async function fetchLimited(url: URL, limit: number, kind: 'api' | 'asset', signal?: AbortSignal): Promise<Buffer> {
  signal?.throwIfAborted();
  let current = url; const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 30000);
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  try {
    for (let redirects = 0; redirects <= 4; redirects++) {
      controller.signal.throwIfAborted();
      const response = await fetch(current, { redirect: 'manual', signal: controller.signal, headers: { Accept: kind === 'api' ? 'application/vnd.github+json' : 'application/octet-stream', 'User-Agent': 'Kitvi-Plugin-Installer' } });
      controller.signal.throwIfAborted();
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location'); await response.body?.cancel(); if (!location || kind !== 'asset' || redirects === 4) throw new Error('Unexpected GitHub release redirect.');
        const next = new URL(location, current);
        if (next.protocol !== 'https:' || next.username || next.password || next.port || !['release-assets.githubusercontent.com', 'objects.githubusercontent.com', 'github-releases.githubusercontent.com'].includes(next.hostname)) throw new Error('Untrusted GitHub release redirect.');
        current = next; continue;
      }
      if (!response.ok || !response.body) { await response.body?.cancel(); const error = new Error(`GitHub returned HTTP ${response.status}.`); Object.assign(error, { status: response.status }); throw error; }
      const declared = response.headers.get('content-length'); if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) { await response.body.cancel(); throw new Error('GitHub response exceeds the download limit.'); }
      const chunks: Buffer[] = []; let size = 0; const reader = response.body.getReader();
      try { while (true) { controller.signal.throwIfAborted(); const { done, value } = await reader.read(); controller.signal.throwIfAborted(); if (done) break; size += value.length; if (size > limit) { await reader.cancel(); throw new Error('GitHub response exceeds the download limit.'); } chunks.push(Buffer.from(value)); } }
      finally { reader.releaseLock(); }
      return Buffer.concat(chunks, size);
    }
    throw new Error('Too many GitHub redirects.');
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}

export class PluginManager extends EventEmitter {
  private readonly options: PluginManagerOptions;
  private readonly root: string;
  private readonly resources: string;
  private readonly staging: string;
  private readonly data: string;
  private readonly registry: string;
  private readonly pending = new Map<string, Pending>();
  private readonly integrity = new Map<string, Integrity>();
  private consents = new Map<string, Consent>();
  private current: PluginState = { system: { enabled: false, acceptedAt: null }, plugins: [], busy: false, message: null };
  private failure: string | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private disposed = false;

  constructor(options: PluginManagerOptions) {
    super(); this.options = options; this.root = path.resolve(options.directory, 'plugins');
    this.resources = path.join(this.root, 'resources'); this.staging = path.join(this.root, 'staging'); this.data = path.join(this.root, 'data'); this.registry = path.join(this.root, 'registry.json');
    try {
      for (const folder of [this.root, this.resources, this.staging, this.data]) ensureDirectory(folder);
      if (fs.existsSync(this.registry)) this.loadRegistry();
    } catch (error) { this.failure = `Plugin registry/storage error: ${message(error)}`; this.current.message = this.failure; this.options.log(this.failure); }
  }

  get state(): PluginState { return structuredClone(this.current); }
  private finishedState(): PluginState { return { ...this.state, busy: false }; }
  get(id: string): InstalledPlugin | undefined { const item = this.current.plugins.find((plugin) => plugin.id === id); return item ? structuredClone(item) : undefined; }
  canRun(id: string): boolean {
    const plugin = this.current.plugins.find((item) => item.id === id);
    return !this.failure && !this.disposed && this.current.system.enabled && !!plugin?.enabled && consentMatches(plugin, this.consents.get(id));
  }
  assertRunnable(id: string): void {
    validatePluginId(id);
    if (this.failure || this.disposed) throw new Error(this.failure ?? 'Plugin manager has been disposed.');
    if (!this.current.system.enabled) throw new Error('The plugin system is disabled.');
    const plugin = this.get(id);
    if (!plugin?.enabled) throw new Error('Plugin is not installed or enabled.');
    if (!consentMatches(plugin, this.consents.get(id))) throw new Error('Accept the activation notice for this installed plugin package first.');
  }
  private emitState(): void { this.emit('state', this.state); }
  private run<T>(operation: () => Promise<T> | T): Promise<T> {
    const next = this.queue.then(async () => {
      if (this.disposed) throw new Error('Plugin manager has been disposed.'); if (this.failure) throw new Error(this.failure);
      this.current.busy = true; this.current.message = null; this.emitState();
      try { return await operation(); }
      catch (error) { this.current.message = message(error); this.options.log(`Plugin: ${this.current.message}`); throw error; }
      finally { this.current.busy = false; this.emitState(); }
    });
    this.queue = next.catch(() => {}); return next;
  }
  private loadRegistry(): void {
    const raw: unknown = JSON.parse(readLimited(this.registry, 1024 * 1024).toString('utf8'));
    if (!raw || typeof raw !== 'object' || (raw as { version?: unknown }).version !== 1 || !Array.isArray((raw as { plugins?: unknown }).plugins)) throw new Error('Invalid plugin registry format.');
    const storedIntegrity = (raw as { integrity?: unknown }).integrity;
    if (!storedIntegrity || typeof storedIntegrity !== 'object' || Array.isArray(storedIntegrity)) throw new Error('Plugin registry integrity information is missing.');
    const storedSystem = (raw as { system?: unknown }).system;
    let system: PluginState['system'] = { enabled: false, acceptedAt: null };
    if (storedSystem !== undefined) {
      if (!storedSystem || typeof storedSystem !== 'object' || Array.isArray(storedSystem)) throw new Error('Invalid plugin system settings.');
      const { enabled, acceptedAt } = storedSystem as Record<string, unknown>;
      if (typeof enabled !== 'boolean' || (acceptedAt !== null && (typeof acceptedAt !== 'string' || !Number.isFinite(Date.parse(acceptedAt)))) || (enabled && acceptedAt === null)) throw new Error('Invalid plugin system acceptance.');
      system = { enabled, acceptedAt: acceptedAt as string | null };
    }
    const storedConsents = (raw as { consents?: unknown }).consents;
    if (storedConsents !== undefined && (!storedConsents || typeof storedConsents !== 'object' || Array.isArray(storedConsents))) throw new Error('Invalid plugin activation receipts.');
    const consents = new Map<string, Consent>();
    const plugins: InstalledPlugin[] = [], ids = new Set<string>();
    for (const item of (raw as { plugins: unknown[] }).plugins) {
      if (!item || typeof item !== 'object') throw new Error('Invalid installed plugin record.');
      const record = item as Record<string, unknown>;
      const { enabled, source, installedAt, contentHash, needsConsent: _hostOnly, ...rawManifest } = record;
      const manifest = validatePluginManifest(rawManifest, this.options.appVersion);
      if (ids.has(manifest.id) || typeof enabled !== 'boolean' || !isSource(source) || typeof installedAt !== 'string' || !Number.isFinite(Date.parse(installedAt)) || typeof contentHash !== 'string' || !/^[a-f0-9]{64}$/.test(contentHash)) throw new Error('Invalid installed plugin registry record.');
      const directory = safeChild(this.resources, manifest.id);
      if (!fs.lstatSync(directory).isDirectory() || (manifest.entry && !fs.lstatSync(safeChild(directory, manifest.entry)).isFile())) throw new Error('Installed plugin files are missing.');
      const expected: unknown = Object.hasOwn(storedIntegrity, manifest.id) ? (storedIntegrity as Record<string, unknown>)[manifest.id] : null;
      if (!expected || typeof expected !== 'object' || Array.isArray(expected) || typeof (expected as Integrity).treeHash !== 'string' || !/^[a-f0-9]{64}$/.test((expected as Integrity).treeHash)) throw new Error('Plugin registry integrity record is invalid.');
      const files: Record<string, string> = Object.create(null) as Record<string, string>;
      if (treeHash(directory, files) !== (expected as Integrity).treeHash) throw new Error(`Installed plugin ${manifest.id} changed; integrity check failed.`);
      this.integrity.set(manifest.id, { treeHash: (expected as Integrity).treeHash, files });
      if (manifest.apiVersion === 2) readTheme(directory, manifest, { treeHash: (expected as Integrity).treeHash, files });
      const plugin: InstalledPlugin = { ...manifest, enabled, source, installedAt, contentHash, needsConsent: true };
      const storedConsent = storedConsents && Object.hasOwn(storedConsents, manifest.id) ? (storedConsents as Record<string, unknown>)[manifest.id] : undefined;
      if (storedConsent && typeof storedConsent === 'object' && !Array.isArray(storedConsent)) {
        const receipt = storedConsent as Record<string, unknown>;
        if (typeof receipt.acceptedAt === 'string' && Number.isFinite(Date.parse(receipt.acceptedAt)) && typeof receipt.version === 'string' && semver.valid(receipt.version) === receipt.version && typeof receipt.contentHash === 'string' && /^[a-f0-9]{64}$/.test(receipt.contentHash) && isSource(receipt.source) && typeof receipt.author === 'string' && (receipt.authorEmail === undefined || typeof receipt.authorEmail === 'string') && (receipt.apiVersion === undefined || receipt.apiVersion === 1 || receipt.apiVersion === 2) && (receipt.kind === undefined || receipt.kind === 'theme') && Array.isArray(receipt.permissions) && receipt.permissions.length <= 5 && new Set(receipt.permissions).size === receipt.permissions.length && receipt.permissions.every((permission) => ['storage', 'downloads', 'media', 'theme', 'playback'].includes(permission))) {
          const consent: Consent = { apiVersion: receipt.apiVersion ?? 1, ...(receipt.kind === 'theme' ? { kind: 'theme' as const } : {}), version: receipt.version, contentHash: receipt.contentHash, source: receipt.source, author: receipt.author, ...(typeof receipt.authorEmail === 'string' ? { authorEmail: receipt.authorEmail } : {}), permissions: [...receipt.permissions], acceptedAt: receipt.acceptedAt };
          if (consentMatches(plugin, consent)) { consents.set(plugin.id, consent); plugin.needsConsent = false; }
        }
      }
      ids.add(manifest.id); plugins.push(plugin);
    }
    this.consents = consents; this.current.system = system; this.current.plugins = plugins;
  }
  private save(plugins: InstalledPlugin[], consents = this.consents, system = this.current.system): void {
    const integrity = Object.fromEntries(plugins.map((plugin) => { const item = this.integrity.get(plugin.id); if (!item) throw new Error('Plugin integrity record is missing.'); return [plugin.id, { treeHash: item.treeHash }]; }));
    const storedPlugins = plugins.map(({ needsConsent: _hostOnly, ...plugin }) => plugin);
    const retainedConsents = new Map(plugins.flatMap((plugin) => { const receipt = consents.get(plugin.id); return consentMatches(plugin, receipt) ? [[plugin.id, receipt!] as const] : []; }));
    atomicJson(this.registry, { version: 1, system, plugins: storedPlugins, integrity, consents: Object.fromEntries(retainedConsents) });
    this.consents = retainedConsents; this.current.system = { ...system }; this.current.plugins = plugins.map((plugin) => ({ ...plugin, needsConsent: !retainedConsents.has(plugin.id) }));
  }
  private requirePlugin(id: string, permission?: 'storage'): InstalledPlugin {
    this.assertRunnable(id); const plugin = this.get(id)!;
    if (permission && !plugin.permissions.includes(permission)) throw new Error('Plugin did not declare the storage permission.');
    return plugin;
  }
  private checkUpdate(manifest: PluginManifest, source: string, hash: string): InstalledPlugin | undefined {
    const installed = this.get(manifest.id); if (!installed) return undefined;
    if (installed.source !== source) throw new Error('This plugin ID belongs to another source. Uninstall it before changing sources.');
    if (installed.contentHash === hash) return installed;
    if (semver.lte(manifest.version, installed.version)) throw new Error('A changed package must have a newer version; downgrades and replacement of the same version are blocked.');
    return installed;
  }
  private cleanupPreviews(): void {
    for (const [token, preview] of this.pending) if (preview.expires <= Date.now()) { this.deleteOwned(preview.directory, this.staging); this.pending.delete(token); }
  }
  private deleteOwned(directory: string, parent: string): void {
    if (path.dirname(directory) !== parent || !within(this.root, directory)) throw new Error('Refusing to remove an unowned plugin directory.');
    assertNoLinks(directory); if (!fs.existsSync(directory)) return;
    const verify = (folder: string) => { for (const item of fs.readdirSync(folder, { withFileTypes: true })) { const child = safeChild(folder, item.name); if (item.isSymbolicLink()) throw new Error('Refusing to remove a linked plugin resource.'); if (item.isDirectory()) verify(child); } };
    verify(directory); fs.rmSync(directory, { recursive: true, force: false });
  }
  private assertUpdateBinding(expected: UpdateBinding): void {
    const installed = this.get(expected.id);
    if (!installed || installed.source !== expected.source || installed.version !== expected.version || installed.contentHash !== expected.contentHash) throw new Error('Installed plugin changed after update preparation; review the update again.');
  }
  private async stage(buffer: Buffer, source: string, update?: { installed: UpdateBinding; version: string }, signal?: AbortSignal): Promise<PluginPreview> {
    signal?.throwIfAborted();
    this.cleanupPreviews(); const token = randomUUID(), directory = safeChild(this.staging, token); ensureDirectory(directory);
    try {
      await extractArchive(buffer, directory);
      signal?.throwIfAborted();
      const manifestPath = safeChild(directory, 'kitvi-plugin.json'); const manifest = validatePluginManifest(JSON.parse(readLimited(manifestPath, 32 * 1024).toString('utf8')), this.options.appVersion);
      if (update) {
        this.assertUpdateBinding(update.installed);
        if (manifest.id !== update.installed.id) throw new Error('Plugin update ID does not match the installed plugin.');
        if (manifest.version !== update.version) throw new Error('Plugin release tag and manifest version do not match.');
        if (!semver.gt(manifest.version, update.installed.version)) throw new Error('A plugin update must have a newer version.');
      }
      if (manifest.entry && !fs.lstatSync(safeChild(directory, manifest.entry)).isFile()) throw new Error('Plugin entry does not exist.');
      if (manifest.apiVersion === 2) readTheme(directory, manifest);
      const contentHash = createHash('sha256').update(buffer).digest('hex'); this.checkUpdate(manifest, source, contentHash);
      const files: Record<string, string> = Object.create(null) as Record<string, string>; const integrity = { treeHash: treeHash(directory, files), files };
      signal?.throwIfAborted();
      this.pending.set(token, { token, manifest, source, contentHash, integrity, directory, expires: Date.now() + PREVIEW_TTL, ...(update ? { update: update.installed } : {}) });
      return { token, manifest: structuredClone(manifest), source, permissions: [...manifest.permissions] };
    } catch (error) { this.deleteOwned(directory, this.staging); throw error; }
  }
  previewFile(zipPath: string): Promise<PluginPreview> { return this.run(() => { if (typeof zipPath !== 'string' || !path.isAbsolute(zipPath) || !zipPath.toLowerCase().endsWith('.kitvi-plugin.zip')) throw new Error('Choose a .kitvi-plugin.zip package.'); return this.stage(readLimited(zipPath, ARCHIVE_LIMIT), 'local'); }); }
  previewRepository(repository: string): Promise<PluginPreview> {
    return this.run(async () => {
      if (typeof repository !== 'string' || repository.length > 240) throw new Error('Invalid GitHub repository.');
      return this.previewRepositoryPackage(repositoryId(repository));
    });
  }
  previewUpdate(id: string, signal?: AbortSignal): Promise<PluginPreview> {
    return this.run(() => {
      signal?.throwIfAborted();
      validatePluginId(id); const installed = this.get(id);
      if (!installed) throw new Error('Plugin is not installed.');
      if (!installed.source.startsWith('github:')) throw new Error('Local ZIP plugins must be updated by choosing a new ZIP package.');
      const repo = repositoryId(installed.source.slice(7));
      return this.previewRepositoryPackage(repo, { id, source: installed.source, version: installed.version, contentHash: installed.contentHash }, signal);
    });
  }
  private async previewRepositoryPackage(repo: string, update?: UpdateBinding, signal?: AbortSignal): Promise<PluginPreview> {
      const release = JSON.parse((await fetchLimited(new URL(`https://api.github.com/repos/${repo}/releases/latest`), 1024 * 1024, 'api', signal)).toString('utf8')) as { draft?: unknown; prerelease?: unknown; tag_name?: unknown; assets?: unknown };
      if (release.draft !== false || !Array.isArray(release.assets)) throw new Error('No public stable plugin release is available.');
      let version: string | null = null;
      if (update) {
        const tag = release.tag_name;
        version = typeof tag === 'string' && tag.length <= 65 ? semver.valid(tag) : null;
        if (!version || (tag !== version && tag !== `v${version}`) || semver.prerelease(version) || release.prerelease === true) throw new Error('Plugin release tag must be a stable semantic version.');
        if (!semver.gt(version, update.version)) throw new Error('A plugin update must have a newer version.');
      }
      const assets = release.assets as { name?: unknown; size?: unknown; browser_download_url?: unknown }[];
      const packages = assets.filter((asset) => typeof asset.name === 'string' && assetName.test(asset.name)); const sums = assets.filter((asset) => asset.name === 'SHA256SUMS.txt');
      if (packages.length !== 1 || sums.length !== 1) throw new Error('A plugin release must contain one .kitvi-plugin.zip and SHA256SUMS.txt.');
      const archive = packages[0], checksum = sums[0];
      if (typeof archive.size !== 'number' || archive.size > ARCHIVE_LIMIT || archive.size <= 0 || typeof checksum.size !== 'number' || checksum.size > 64 * 1024) throw new Error('Plugin release assets exceed size limits.');
      const archiveUrl = releaseAssetUrl(archive.browser_download_url, repo, archive.name as string), checksumUrl = releaseAssetUrl(checksum.browser_download_url, repo, 'SHA256SUMS.txt');
      const checksumText = (await fetchLimited(checksumUrl, 64 * 1024, 'asset', signal)).toString('utf8');
      const matches = checksumText.split(/\r?\n/).map((line) => /^([a-fA-F0-9]{64}) [ *](.+)$/.exec(line)).filter((line) => line?.[2] === archive.name);
      if (matches.length !== 1) throw new Error('Release checksum file must name the plugin package exactly once.');
      const buffer = await fetchLimited(archiveUrl, ARCHIVE_LIMIT, 'asset', signal);
      if (buffer.length !== archive.size || createHash('sha256').update(buffer).digest('hex') !== matches[0]![1].toLowerCase()) throw new Error('Plugin release SHA-256 checksum does not match.');
      return this.stage(buffer, `github:${repo}`, update ? { installed: update, version: version! } : undefined, signal);
  }
  confirm(token: string): Promise<PluginState> {
    return this.run(() => {
      this.cleanupPreviews(); if (typeof token !== 'string' || !this.pending.has(token)) throw new Error('Plugin preview expired; review the package again.');
      const preview = this.pending.get(token)!;
      if (preview.update) this.assertUpdateBinding(preview.update);
      const old = this.checkUpdate(preview.manifest, preview.source, preview.contentHash);
      if (treeHash(preview.directory) !== preview.integrity.treeHash) throw new Error('Plugin resources changed after preview; integrity check failed.');
      if (old?.contentHash === preview.contentHash) { this.deleteOwned(preview.directory, this.staging); this.pending.delete(token); return this.finishedState(); }
      const target = safeChild(this.resources, preview.manifest.id), backup = safeChild(this.staging, `${randomUUID()}-backup`);
      const consents = new Map(this.consents), previousConsent = old ? this.consents.get(old.id) : undefined;
      const canCarryConsent = old && consentMatches(old, previousConsent) && preview.source.startsWith('github:') && old.source === preview.source && samePublisherAndPermissions(preview.manifest, old);
      if (canCarryConsent) consents.set(old.id, { ...previousConsent!, version: preview.manifest.version, contentHash: preview.contentHash }); else consents.delete(preview.manifest.id);
      const installed: InstalledPlugin = { ...preview.manifest, enabled: canCarryConsent ? old.enabled : false, source: preview.source, installedAt: new Date().toISOString(), contentHash: preview.contentHash, needsConsent: !canCarryConsent };
      let backedUp = false, moved = false; const previousIntegrity = this.integrity.get(installed.id);
      try {
        this.options.beforeCommit?.();
        if (fs.existsSync(target)) { if (!old) throw new Error('An unregistered directory already owns this plugin ID.'); treeHash(target); fs.renameSync(target, backup); backedUp = true; }
        assertNoLinks(preview.directory); fs.renameSync(preview.directory, target); moved = true;
        this.integrity.set(installed.id, preview.integrity);
        this.save([...this.current.plugins.filter((plugin) => plugin.id !== installed.id), installed], consents);
      } catch (error) { if (previousIntegrity) this.integrity.set(installed.id, previousIntegrity); else this.integrity.delete(installed.id); if (moved) this.deleteOwned(target, this.resources); if (backedUp) fs.renameSync(backup, target); throw error; }
      this.pending.delete(token); if (backedUp) this.deleteOwned(backup, this.staging); return this.finishedState();
    });
  }
  setEnabled(id: string, enabled: boolean): Promise<PluginState> {
    return this.run(() => {
      validatePluginId(id); const installed = this.get(id);
      if (typeof enabled !== 'boolean' || !installed) throw new Error('Unknown plugin or invalid enabled state.');
      if (enabled && !consentMatches(installed, this.consents.get(id))) throw new Error('Accept the activation notice for this installed plugin package first.');
      this.save(this.current.plugins.map((plugin) => plugin.id === id ? { ...plugin, enabled } : plugin)); return this.finishedState();
    });
  }
  setSystemEnabled(enabled: boolean, acceptNotice = false): Promise<PluginState> {
    return this.run(() => {
      if (typeof enabled !== 'boolean' || typeof acceptNotice !== 'boolean') throw new Error('Invalid plugin system state or notice acceptance.');
      if (enabled && !this.current.system.acceptedAt && acceptNotice !== true) throw new Error('Accept the plugin system notice before enabling plugins.');
      const system = { enabled, acceptedAt: this.current.system.acceptedAt ?? (enabled ? new Date().toISOString() : null) };
      this.save(this.current.plugins, this.consents, system); return this.finishedState();
    });
  }
  acceptActivation(id: string, contentHash: string): Promise<PluginState> {
    return this.run(() => {
      validatePluginId(id); const installed = this.get(id);
      if (!installed || typeof contentHash !== 'string' || installed.contentHash !== contentHash) throw new Error('Installed plugin package changed; review its activation notice again.');
      const consents = new Map(this.consents);
      consents.set(id, { apiVersion: installed.apiVersion, ...(installed.kind ? { kind: installed.kind } : {}), version: installed.version, contentHash, source: installed.source, author: installed.author, ...(installed.authorEmail ? { authorEmail: installed.authorEmail } : {}), permissions: [...installed.permissions], acceptedAt: new Date().toISOString() });
      this.save(this.current.plugins.map((plugin) => plugin.id === id ? { ...plugin, enabled: true } : plugin), consents); return this.finishedState();
    });
  }
  remove(id: string): Promise<PluginState> {
    return this.run(() => {
      validatePluginId(id); if (!this.get(id)) throw new Error('Plugin is not installed.');
      const target = safeChild(this.resources, id), backup = safeChild(this.staging, `${randomUUID()}-removed`);
      treeHash(target); const dataDirectory = safeChild(this.data, id);
      if (fs.existsSync(dataDirectory)) { for (const item of fs.readdirSync(dataDirectory)) { const file = safeChild(dataDirectory, item); if (!fs.lstatSync(file).isFile()) throw new Error('Unexpected file in plugin data directory.'); } }
      fs.renameSync(target, backup);
      try { this.save(this.current.plugins.filter((plugin) => plugin.id !== id)); } catch (error) { fs.renameSync(backup, target); throw error; }
      this.deleteOwned(backup, this.staging); this.deleteOwned(safeChild(this.data, id), this.data);
      this.integrity.delete(id);
      for (const [token, preview] of this.pending) if (preview.manifest.id === id) { this.deleteOwned(preview.directory, this.staging); this.pending.delete(token); }
      return this.finishedState();
    });
  }
  async readResource(id: string, relativePath: string): Promise<{ data: Buffer; mime: string }> {
    if (this.failure || this.disposed) throw new Error(this.failure ?? 'Plugin manager has been disposed.'); this.requirePlugin(id);
    const name = validateArchivePath(relativePath), mime = resourceMime(name); const file = safeChild(safeChild(this.resources, id), name);
    const data = readLimited(file, fileLimit(name));
    if (this.integrity.get(id)?.files[name] !== createHash('sha256').update(data).digest('hex')) throw new Error('Plugin resource changed; integrity check failed.');
    return { data, mime };
  }
  getThemeDefinition(id: string): ThemeDefinition {
    this.assertRunnable(id);
    const plugin = this.get(id)!;
    return readTheme(safeChild(this.resources, id), plugin, this.integrity.get(id));
  }
  private storageFile(id: string): string { const directory = safeChild(this.data, id); ensureDirectory(directory); return safeChild(directory, 'storage.json'); }
  private storageKey(key: string): void { if (typeof key !== 'string' || key.length < 1 || key.length > 128 || /[\x00-\x1f]/.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Invalid plugin storage key.'); }
  private readStorage(file: string): Record<string, unknown> {
    if (!fs.existsSync(file)) return Object.create(null) as Record<string, unknown>;
    const value: unknown = JSON.parse(readLimited(file, STORAGE_LIMIT).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => ['__proto__', 'constructor', 'prototype'].includes(key))) throw new Error('Plugin storage is corrupt.'); return value as Record<string, unknown>;
  }
  pluginStorageGet(id: string, key: string): Promise<unknown> { return this.run(() => { this.requirePlugin(id, 'storage'); this.storageKey(key); const storage = this.readStorage(this.storageFile(id)); return Object.hasOwn(storage, key) ? storage[key] : null; }); }
  pluginStorageSet(id: string, key: string, value: unknown): Promise<void> {
    return this.run(() => {
      this.requirePlugin(id, 'storage'); this.storageKey(key); const file = this.storageFile(id), storage = this.readStorage(file);
      const serialized = JSON.stringify(value); if (serialized === undefined) throw new Error('Plugin storage accepts JSON values only.'); storage[key] = JSON.parse(serialized);
      if (Buffer.byteLength(JSON.stringify(storage, null, 2)) > STORAGE_LIMIT) throw new Error('Plugin storage exceeds 64 KiB.'); atomicJson(file, storage);
    });
  }
  async dispose(): Promise<void> {
    this.disposed = true; await this.queue;
    for (const preview of this.pending.values()) { try { this.deleteOwned(preview.directory, this.staging); } catch (error) { this.options.log(`Plugin staging cleanup: ${message(error)}`); } }
    this.pending.clear(); this.removeAllListeners();
  }
}
