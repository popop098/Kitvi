// Explicit manual network probe; excluded from npm test's *.test.mjs pattern.
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';
import { MediaService } from '../electron/media-service.ts';

const runtimeExecutable = process.argv[2];
if (!runtimeExecutable) throw new Error('Usage: node tests/media-official-probe.mjs <absolute Kitvi.exe/Electron.exe>');
const directory = await mkdtemp(join(tmpdir(), 'kitvi-official-probe-'));
const report = { at: new Date().toISOString(), runtime: null, engine: null, analyze: null, download: null, audio: null, cancel: null, error: null };
const service = new MediaService({ directory, runtimeExecutable: resolve(runtimeExecutable), log: (message) => console.log(message) });
try {
  const runtime = spawnSync(runtimeExecutable, ['--eval', 'console.log(JSON.stringify({node:process.versions.node,electron:process.versions.electron}))'], { shell: false, windowsHide: true, timeout: 15000, encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
  if (runtime.status !== 0) throw new Error(`Embedded runtime failed: ${runtime.error?.message ?? runtime.stderr}`);
  report.runtime = JSON.parse(runtime.stdout.trim()); console.log('Embedded Node runtime:', JSON.stringify(report.runtime));
  await service.ensureEngine(); report.engine = service.snapshot('probe').engine; console.log('Verified official engine:', JSON.stringify(report.engine));
  // Current primary YoutubeIE fixture in upstream yt_dlp/extractor/youtube/_video.py.
  const url = 'https://www.youtube.com/watch?v=YE7VzlLtp-4';
  report.analyze = await service.analyze('probe', url); console.log('Official test video metadata:', JSON.stringify(report.analyze));
  for (const mode of ['video', 'audio']) {
    const job = await service.start('probe', { url, mode, directory });
    const deadline = setTimeout(() => { void service.cancel('probe', job.id); }, 90000);
    const finished = await new Promise((done) => { const check = () => { const state = service.snapshot('probe').jobs.find((entry) => entry.id === job.id); if (state && !['queued', 'running'].includes(state.phase)) { service.off('state', check); done(state); } }; service.on('state', check); check(); });
    clearTimeout(deadline);
    if (finished.phase !== 'completed') throw new Error(`Test download ${finished.phase}: ${finished.error ?? ''}`);
    const result = { phase: finished.phase, size: (await stat(finished.filename)).size, mode, extension: extname(finished.filename) };
    report[mode === 'video' ? 'download' : 'audio'] = result; console.log('Official test download:', JSON.stringify(result));
  }
  const cancellation = await service.start('probe', { url, mode: 'video', directory }); await service.cancel('probe', cancellation.id);
  report.cancel = { phase: service.snapshot('probe').jobs.find((job) => job.id === cancellation.id).phase, activeAfterCancel: service.hasActiveJobs() };
  if (report.cancel.phase !== 'cancelled' || report.cancel.activeAfterCancel) throw new Error('Cancellation did not settle owned processes.');
} catch (error) { report.error = error.message; process.exitCode = 1; }
finally { await service.stop(); await rm(directory, { recursive: true, force: true }); console.log(JSON.stringify(report, null, 2)); }
