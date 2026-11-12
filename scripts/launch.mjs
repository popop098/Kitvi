import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require('electron'), [root], { env, stdio: 'inherit', windowsHide: false });
child.on('exit', (code) => process.exit(code || 0)); child.on('error', (error) => { console.error(error.message); process.exit(1); });
