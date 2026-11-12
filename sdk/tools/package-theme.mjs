import { lstat, readdir, readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, relative, dirname, sep, isAbsolute, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { validatePluginManifest, validateArchivePath } from '../../shared/plugin-schema.ts';
import { validateThemeDefinition, themeResourceReferences } from '../../shared/theme-schema.ts';
import { PluginManager } from '../../electron/plugins.ts';

function crc32(data) { let crc = 0xffffffff; for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
/** Produces an uncompressed ZIP with stable ordering and portable paths. */
export async function packageTheme(source, output) {
  source = resolve(source); output = resolve(output);
  const outputRelative = relative(source, output);
  if (!isAbsolute(outputRelative) && !outputRelative.startsWith('..' + sep) && outputRelative !== '..') throw Error('Output must be outside the source directory.');
  if ((await lstat(source)).isSymbolicLink()) throw Error('Linked source directories are not allowed.');
  let total = 0;
  const excluded = new Set(['.git','.cache','.tools','node_modules','dist','build','release']);
  const files = [], visit = async (folder, prefix = '') => {
    for (const entry of (await readdir(folder, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
      if (excluded.has(entry.name) || entry.name === '.env' || entry.name.startsWith('.env.')) continue;
      const name = validateArchivePath(prefix + entry.name), file = resolve(folder, entry.name);
      if (entry.isSymbolicLink()) throw Error('Linked package resources are not allowed.');
      if (entry.isDirectory()) { await visit(file, name + '/'); continue; }
      if (!entry.isFile()) throw Error('Package resources must be regular files.');
      const stat = await lstat(file); if (stat.size > 4 * 1024 * 1024) throw Error('A resource exceeds 4 MiB.');
      total += stat.size; if (total > 16 * 1024 * 1024) throw Error('Package resources exceed 16 MiB.');
      files.push({ name, data: await readFile(file) }); if (files.length > 256) throw Error('Too many package entries.');
    }
  };
  await visit(source);
  const manifestFile = files.find(file => file.name === 'kitvi-plugin.json');
  if (!manifestFile) throw Error('Missing kitvi-plugin.json.');
  const manifest = validatePluginManifest(JSON.parse(manifestFile.data.toString('utf8')), '0.7.0');
  if (manifest.apiVersion !== 2) throw Error('This packager expects an SDK2 theme.');
  const definitionFile = files.find(file => file.name === manifest.theme); if (!definitionFile) throw Error('Missing theme definition.');
  const theme = validateThemeDefinition(JSON.parse(definitionFile.data.toString('utf8')));
  if (theme.id !== manifest.id) throw Error('Theme and plugin IDs differ.');
  for (const ref of themeResourceReferences(theme)) if (!files.some(file => file.name === ref.path)) throw Error('Missing theme asset: ' + ref.path);
  const local = [], central = []; let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name), data = file.data, crc = crc32(data);
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20,4); header.writeUInt16LE(0x800,6); header.writeUInt32LE(crc,14); header.writeUInt32LE(data.length,18); header.writeUInt32LE(data.length,22); header.writeUInt16LE(name.length,26);
    local.push(header,name,data);
    const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20,4); entry.writeUInt16LE(20,6); entry.writeUInt16LE(0x800,8); entry.writeUInt32LE(crc,16); entry.writeUInt32LE(data.length,20); entry.writeUInt32LE(data.length,24); entry.writeUInt16LE(name.length,28); entry.writeUInt32LE(offset,42);
    central.push(entry,name); offset += header.length + name.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length,8); end.writeUInt16LE(files.length,10); end.writeUInt32LE(directory.length,12); end.writeUInt32LE(offset,16);
  const archive = Buffer.concat([...local,directory,end]); if (archive.length > 16 * 1024 * 1024) throw Error('Package exceeds 16 MiB.');
  // Reuse the installer's complete schema, optional-entry, MIME and size checks.
  // Validation extracts static data into an owned temporary profile, never activates it.
  const validationDirectory = await mkdtemp(join(tmpdir(),'kitvi-theme-package-'));
  let validator;
  try {
    const candidate = join(validationDirectory,'candidate.kitvi-plugin.zip'); await writeFile(candidate,archive);
    validator = new PluginManager({directory:validationDirectory,appVersion:'0.7.0',log:()=>{}});
    await validator.previewFile(candidate);
  } finally { await validator?.dispose(); await rm(validationDirectory,{recursive:true,force:true}); }
  await mkdir(dirname(output), { recursive:true }); await writeFile(output, archive);
  return { output, bytes:archive.length, files:files.length, id:manifest.id };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw Error('Usage: node sdk/tools/package-theme.mjs <source> [output.kitvi-plugin.zip]');
  console.log(JSON.stringify(await packageTheme(process.argv[2], process.argv[3] || '.cache/theme.kitvi-plugin.zip'), null, 2));
}
