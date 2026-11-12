import semver from 'semver';
import type { PluginManifest, PluginPermission } from './features.ts';

const manifestKeys = new Set(['apiVersion', 'id', 'name', 'version', 'minKitviVersion', 'description', 'author', 'authorEmail', 'entry', 'permissions']);
const permissions = new Set<PluginPermission>(['storage', 'downloads', 'media']);
const reserved = /^(?:con|prn|aux|nul|conin\$|conout\$|clock\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i;
const pluginId = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)+$/;

/** Portable package paths are also valid Windows paths; never normalize hostile input. */
export function validateArchivePath(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 240 || value !== value.normalize('NFC') || /[\\\x00-\x1f\x7f<>:"|?*]/.test(value)) throw new Error('Invalid plugin resource path.');
  const segments = value.split('/');
  if (segments.some((part) => !part || part === '.' || part === '..' || part.length > 128 || /[. ]$/.test(part) || reserved.test(part))) throw new Error('Unsafe plugin resource path.');
  return value;
}

export function validatePluginId(value: unknown): string {
  if (typeof value !== 'string' || value.length > 128 || !pluginId.test(value) || reserved.test(value)) throw new Error('Invalid plugin ID (use lowercase dotted names, for example kitvi.example).');
  return value;
}

function text(value: unknown, name: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) throw new Error(`Invalid plugin ${name}.`);
  return value;
}

export function validatePluginManifest(value: unknown, appVersion: string): PluginManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('kitvi-plugin.json must contain an object.');
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some((key) => !manifestKeys.has(key))) throw new Error('Unknown plugin manifest field; SDK 1 supports static web plugins only.');
  if (raw.apiVersion !== 1) throw new Error('This plugin requires an unsupported SDK API version.');
  const version = text(raw.version, 'version', 64), minKitviVersion = text(raw.minKitviVersion, 'minimum Kitvi version', 64);
  if (semver.valid(version) !== version || semver.valid(minKitviVersion) !== minKitviVersion) throw new Error('Plugin versions must be full semantic versions (for example 1.0.0).');
  if (!semver.valid(appVersion) || semver.lt(appVersion, minKitviVersion)) throw new Error(`This plugin requires Kitvi ${minKitviVersion} or later.`);
  const entry = validateArchivePath(raw.entry);
  if (!entry.endsWith('.html')) throw new Error('Plugin entry must be a local .html file.');
  if (!Array.isArray(raw.permissions) || raw.permissions.length > 3 || raw.permissions.some((item) => !permissions.has(item)) || new Set(raw.permissions).size !== raw.permissions.length) throw new Error('Unsupported or duplicate plugin permissions.');
  if (Object.hasOwn(raw, 'authorEmail') && (typeof raw.authorEmail !== 'string' || raw.authorEmail.length > 254 || /[\p{Cc}\s]/u.test(raw.authorEmail) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw.authorEmail))) throw new Error('Invalid plugin author email.');
  if (Object.hasOwn(raw, 'authorEmail') && semver.lt(minKitviVersion, '0.6.0')) throw new Error('Plugin author email requires minKitviVersion 0.6.0 or later.');
  return { apiVersion: 1, id: validatePluginId(raw.id), name: text(raw.name, 'name', 80), version, minKitviVersion, description: text(raw.description, 'description', 1000), author: text(raw.author, 'author', 120), ...(typeof raw.authorEmail === 'string' ? { authorEmail: raw.authorEmail } : {}), entry, permissions: [...raw.permissions] };
}
