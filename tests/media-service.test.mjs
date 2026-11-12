import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { MediaService, canonicalizeYouTubeUrl, buildMediaArgs, parseMediaProgress } from '../electron/media-service.ts';

test('YouTube URL boundary accepts only public single-video forms and removes tracking', () => {
  for (const url of ['https://www.youtube.com/watch?v=BaW_jenozKc&list=abc', 'https://youtu.be/BaW_jenozKc?t=4', 'https://youtube.com/shorts/BaW_jenozKc']) assert.equal(canonicalizeYouTubeUrl(url), 'https://www.youtube.com/watch?v=BaW_jenozKc');
  for (const url of ['file:///video', 'http://youtube.com/watch?v=BaW_jenozKc', 'https://youtube.com.evil.test/watch?v=BaW_jenozKc', 'https://a:b@youtube.com/watch?v=BaW_jenozKc', 'https://youtube.com/playlist?list=abc', 'https://youtu.be/short', 'https://localhost/watch?v=BaW_jenozKc', 'https://youtube.com:444/watch?v=BaW_jenozKc', '--exec calc']) assert.throws(() => canonicalizeYouTubeUrl(url));
});

test('host argument construction isolates runtime and needs no shell or FFmpeg', () => {
  const args = buildMediaArgs('C:/Program Files/Kitvi/Kitvi.exe', { url: 'https://youtu.be/BaW_jenozKc', mode: 'audio', directory: 'C:/Users/me/Downloads', jobId: 'abc' });
  assert.equal(args[args.length - 1], 'https://www.youtube.com/watch?v=BaW_jenozKc');
  for (const value of ['--ignore-config', '--no-plugin-dirs', '--no-remote-components', '--no-js-runtimes', 'node:C:/Program Files/Kitvi/Kitvi.exe', '--no-overwrites', '--max-filesize', '2147483648']) assert(args.includes(value));
  assert.equal(args[args.indexOf('--format') + 1], 'bestaudio[ext=m4a]/bestaudio');
  assert(!args.includes('--extract-audio')); assert(!args.includes('--exec')); assert(!args.includes('--cookies-from-browser'));
  assert.throws(() => buildMediaArgs('node', { url: 'https://youtu.be/BaW_jenozKc', mode: '--exec', directory: 'x', jobId: 'a' }));
});

test('progress parsing rejects malformed and non-finite values', () => {
  assert.deepEqual(parseMediaProgress('KITVI_PROGRESS:{"downloaded_bytes":500,"total_bytes":1000,"speed":120,"eta":4}'), { downloadedBytes: 500, totalBytes: 1000, progress: 50, speed: 120, eta: 4 });
  assert.equal(parseMediaProgress('not progress'), null); assert.equal(parseMediaProgress('KITVI_PROGRESS:{bad}'), null);
  const result = parseMediaProgress('KITVI_PROGRESS:{"downloaded_bytes":500,"total_bytes":null,"speed":null,"eta":null}'); assert.equal(result.progress, null); assert.equal(result.totalBytes, null);
});

class Child extends EventEmitter {
  stdout = new PassThrough(); stderr = new PassThrough(); exitCode = null; pid = undefined;
  finish(code = 0) { this.exitCode = code; this.emit('close', code); }
  kill() { queueMicrotask(() => this.finish(1)); return true; }
}
async function fixture(t, corrupt = false) {
  const directory = await mkdtemp(join(tmpdir(), 'kitvi-media-')); const children = []; const invocations = [];
  const binary = Buffer.from('MZofficial engine fixture'); const hash = createHash('sha256').update(binary).digest('hex');
  const fetch = async (url) => {
    if (url.endsWith('/latest')) return new Response(JSON.stringify({ tag_name: '2026.11.01', assets: ['yt-dlp.exe', 'SHA2-256SUMS'].map((name) => ({ name, browser_download_url: `https://github.com/yt-dlp/yt-dlp/releases/download/2026.11.01/${name}` })) }));
    return url.endsWith('SHA2-256SUMS') ? new Response(`${corrupt ? '0'.repeat(64) : hash}  yt-dlp.exe\n`) : new Response(binary);
  };
  const service = new MediaService({ directory, runtimeExecutable: 'C:/Kitvi.exe', log: () => {}, fetch, spawn: (file, args, options) => { const child = new Child(); children.push(child); invocations.push({ file, args, options }); return child; } });
  t.after(async () => { await service.stop(); await rm(directory, { recursive: true, force: true }); });
  return { directory, service, children, invocations };
}

test('official engine installation verifies SHA256 before making it usable', async (t) => {
  const { service, directory } = await fixture(t, true); await assert.rejects(service.ensureEngine(), /SHA256/); assert.equal(service.snapshot('a').engine.phase, 'error');
  await assert.rejects(readFile(join(directory, 'yt-dlp.exe')));
});

test('engine cache tampering prevents execution', async (t) => {
  const { service, directory, children } = await fixture(t); await service.ensureEngine(); await writeFile(join(directory, 'yt-dlp.exe'), 'tampered');
  await assert.rejects(service.analyze('a', 'https://youtu.be/BaW_jenozKc'), /검증|SHA256/); assert.equal(children.length, 0);
});

test('analyze returns only bounded metadata and process options disable shell', async (t) => {
  const { service, children, invocations } = await fixture(t); await service.ensureEngine();
  const promise = service.analyze('a', 'https://youtu.be/BaW_jenozKc'); await new Promise((r) => setTimeout(r, 10));
  children[0].stdout.write(JSON.stringify({ id: 'BaW_jenozKc', title: 'Test', duration: 10, uploader: 'Uploader', webpage_url: 'ignored', formats: ['private'] })); children[0].finish();
  assert.deepEqual(await promise, { id: 'BaW_jenozKc', title: 'Test', duration: 10, uploader: 'Uploader', thumbnail: null });
  assert.equal(invocations[0].options.shell, false); assert.equal(invocations[0].options.windowsHide, true); assert.equal(invocations[0].options.env.ELECTRON_RUN_AS_NODE, '1');
});

test('jobs report progress, enforce ownership, and settle cancellation', async (t) => {
  const { service, directory, children } = await fixture(t); await service.ensureEngine();
  const job = await service.start('a', { url: 'https://youtu.be/BaW_jenozKc', mode: 'video', directory });
  children[0].stdout.write('KITVI_PROGRESS:{"downloaded_bytes":500,"total_bytes":1000,"speed":120,"eta":4}\n');
  assert.equal(service.snapshot('a').jobs[0].progress, 50); assert.equal(service.snapshot('b').jobs.length, 0);
  await assert.rejects(service.cancel('b', job.id), /찾을 수|권한/); await service.cancel('a', job.id);
  assert.equal(service.snapshot('a').jobs[0].phase, 'cancelled'); assert.equal(service.hasActiveJobs(), false);
});

test('engine failure becomes a bounded job error and oversized progress stops download', async (t) => {
  const { service, directory, children } = await fixture(t); await service.ensureEngine();
  await service.start('a', { url: 'https://youtu.be/BaW_jenozKc', mode: 'audio', directory }); children[0].stderr.write('ERROR: unavailable'); children[0].finish(1);
  await new Promise((r) => setTimeout(r, 10)); assert.equal(service.snapshot('a').jobs[0].phase, 'error'); assert.match(service.snapshot('a').jobs[0].error, /unavailable/);
  await service.start('a', { url: 'https://youtu.be/BaW_jenozKc', mode: 'video', directory }); children[1].stdout.write('KITVI_PROGRESS:{"downloaded_bytes":2147483649}\n');
  await new Promise((r) => setTimeout(r, 10)); assert.equal(service.snapshot('a').jobs[0].phase, 'error'); assert.match(service.snapshot('a').jobs[0].error, /2 GB/);
});

test('completed output is moved from owned staging and keeps an existing destination intact', async (t) => {
  const { service, directory, children, invocations } = await fixture(t); await service.ensureEngine();
  const first = await service.start('a', { url: 'https://youtu.be/BaW_jenozKc', mode: 'video', directory });
  const output = invocations[0].args[invocations[0].args.indexOf('--output') + 1].replace('%(title).80B', 'Title').replace('%(id)s', 'BaW_jenozKc').replace('%(ext)s', 'mp4');
  await writeFile(output, 'video bytes'); children[0].stdout.write(`KITVI_FILE:${JSON.stringify(output)}\n`); children[0].finish();
  await new Promise((r) => setTimeout(r, 15)); const completed = service.snapshot('a').jobs[0]; assert.equal(completed.id, first.id); assert.equal(completed.phase, 'completed'); assert.equal(await readFile(completed.filename, 'utf8'), 'video bytes'); await assert.rejects(readFile(output));
  await service.start('a', { url: 'https://youtu.be/BaW_jenozKc', mode: 'video', directory });
  const secondOutput = invocations[1].args[invocations[1].args.indexOf('--output') + 1].replace('%(title).80B', 'Title').replace('%(id)s', 'BaW_jenozKc').replace('%(ext)s', 'mp4');
  const destination = join(directory, secondOutput.slice(dirname(secondOutput).length + 1)); await writeFile(destination, 'keep me'); await writeFile(secondOutput, 'new bytes'); children[1].stdout.write(`KITVI_FILE:${JSON.stringify(secondOutput)}\n`); children[1].finish();
  await new Promise((r) => setTimeout(r, 15)); assert.equal(service.snapshot('a').jobs[0].phase, 'error'); assert.equal(await readFile(destination, 'utf8'), 'keep me');
});

test('stop cancels owned children and prevents all later work', async (t) => {
  const { service, directory } = await fixture(t); await service.ensureEngine(); await service.start('a', { url: 'https://youtu.be/BaW_jenozKc', mode: 'audio', directory }); await service.stop();
  assert.equal(service.snapshot('a').jobs[0].phase, 'cancelled'); assert.equal(service.hasActiveJobs(), false);
  await assert.rejects(service.analyze('a', 'https://youtu.be/BaW_jenozKc'), /종료/);
});

test('cancellation during file finalization cannot publish or become completed', async (t) => {
  const { service, directory, children, invocations } = await fixture(t); await service.ensureEngine();
  const job = await service.start('a', { url: 'https://youtu.be/BaW_jenozKc', mode: 'video', directory });
  const output = invocations[0].args[invocations[0].args.indexOf('--output') + 1].replace('%(title).80B', 'Title').replace('%(id)s', 'BaW_jenozKc').replace('%(ext)s', 'mp4');
  await writeFile(output, 'cancelled bytes'); children[0].stdout.write(`KITVI_FILE:${JSON.stringify(output)}\n`); children[0].finish();
  // The completion continuation has entered its asynchronous stat; cancel wins
  // before that filesystem operation can complete and publish the output.
  await Promise.resolve(); await service.cancel('a', job.id);
  assert.equal(service.snapshot('a').jobs[0].phase, 'cancelled');
  const destination = join(directory, output.slice(dirname(output).length + 1)); await assert.rejects(readFile(destination)); assert.equal(service.hasActiveJobs(), false);
});

test('repeated cancellation also waits for owned process cleanup', async (t) => {
  const { service, directory, children } = await fixture(t); await service.ensureEngine();
  const job = await service.start('a', { url: 'https://youtu.be/BaW_jenozKc', mode: 'audio', directory });
  children[0].kill = () => { setTimeout(() => children[0].finish(1), 20); return true; };
  const first = service.cancel('a', job.id); await service.cancel('a', job.id);
  assert.equal(service.hasActiveJobs(), false); await first;
});
