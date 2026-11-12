import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const watch = process.argv.includes('--watch');
const builder = spawn(process.execPath, [resolve(root, 'scripts/build.mjs'), ...(watch ? ['--watch-design'] : [])], {
  cwd: root, stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true,
});
let electron;
let stopping = false;
builder.on('exit', (code) => {
  if (watch && !stopping && electron) {
    console.error(`Design watcher stopped unexpectedly (${code}). Restart npm run design:dev.`);
    process.exitCode = 1; stop();
  }
});
const ready = new Promise((accept, reject) => {
  let output = '';
  builder.stdout.on('data', (chunk) => {
    process.stdout.write(chunk);
    output = (output + chunk.toString()).slice(-2048);
    if (watch && output.includes('KITVI_DESIGN_READY')) accept();
  });
  builder.once('error', reject);
  builder.once('exit', (code) => {
    if (!watch && code === 0) accept();
    else reject(new Error(`UI build exited (${code}).`));
  });
});
function stop() {
  stopping = true;
  if (electron && electron.exitCode === null) electron.kill();
  if (builder.exitCode === null) builder.kill();
}
process.on('SIGINT', () => { stop(); process.exitCode = 130; });
process.on('SIGTERM', stop);
process.on('exit', stop);
try {
  await ready;
  const env = { ...process.env, KITVI_DESIGN_PREVIEW: '1', KITVI_DESIGN_WATCH: watch ? '1' : '0',
    KITVI_TEST_DATA_DIR: resolve(root, '.cache/design-profile') };
  delete env.ELECTRON_RUN_AS_NODE;
  electron = spawn(require('electron'), [root], { cwd: root, env, stdio: 'inherit', windowsHide: false });
  electron.once('error', (error) => { console.error(error.message); stop(); process.exitCode = 1; });
  electron.once('exit', (code) => { stop(); process.exitCode = process.exitCode || code || 0; });
} catch (error) {
  console.error(error.message); stop(); process.exitCode = 1;
}
