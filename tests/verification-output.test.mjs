import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

test('verification child keeps logging and exits when the launching terminal pipes close', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kitvi-verification-output-'));
  const report = join(directory, 'result.json'), log = join(directory, 'child.log');
  const moduleUrl = pathToFileURL(join(import.meta.dirname, '../verification/process.mjs')).href;
  const writer = `setTimeout(()=>{process.stdout.write('stdout survived\\n');process.stderr.write('stderr survived\\n')},150)`;
  const source = `import {runVerification} from ${JSON.stringify(moduleUrl)};import {writeFile} from 'node:fs/promises';const result=await runVerification({executable:process.execPath,args:['-e',${JSON.stringify(writer)}],logPath:${JSON.stringify(log)},timeoutMs:5000});await writeFile(${JSON.stringify(report)},JSON.stringify(result));`;
  const parent = spawn(process.execPath, ['--input-type=module', '-e', source], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  parent.stdout.destroy(); parent.stderr.destroy();
  try {
    const code = await new Promise((done, reject) => { parent.once('error', reject); parent.once('exit', done); });
    assert.equal(code, 0);
    assert.equal(JSON.parse(await readFile(report, 'utf8')).code, 0);
    assert.equal(await readFile(log, 'utf8'), 'stdout survived\nstderr survived\n');
  } finally { if (parent.exitCode == null) parent.kill(); await rm(directory, { recursive: true, force: true }); }
});
