import { build } from 'esbuild';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { runVerification } from './process.mjs';

const root = resolve(import.meta.dirname, '..');
const directory = join(root, '.cache', `youtube-player-spike-${randomUUID()}`);
await mkdir(directory, { recursive: true });
await build({ entryPoints: { spike: join(root, 'verification/youtube-player-spike.ts'), 'player-preload': join(root, 'electron/player-preload.ts') }, bundle: true, platform: 'node', target: 'node22', format: 'cjs', external: ['electron'], outdir: directory, outExtension: { '.js': '.cjs' } });
const env = { ...process.env, KITVI_PLAYER_SPIKE_DIR: directory }; delete env.ELECTRON_RUN_AS_NODE;
const result = await runVerification({ executable: createRequire(import.meta.url)('electron'), args: [join(directory, 'spike.cjs')], env, logPath: join(directory, 'run.log'), timeoutMs: 45000 });
const report = await readFile(join(directory, 'report.json'), 'utf8').then(JSON.parse, () => ({ mechanics: 'FAIL', error: 'Electron did not produce a report' }));
console.log(JSON.stringify({ ...report, process: result, directory }, null, 2));
if (result.code !== 0 || result.timedOut || report.mechanics !== 'PASS' || report.playback !== 'PASS') process.exitCode = 1;
