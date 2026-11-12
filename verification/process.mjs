import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { dirname } from 'node:path';

/** A GUI child must own file handles, not inherit a short-lived tool's pipes. */
export async function runVerification({ executable, args, env = process.env, logPath, timeoutMs = 90000 }) {
  mkdirSync(dirname(logPath), { recursive: true });
  const descriptor = openSync(logPath, 'a');
  let child;
  try {
    child = spawn(executable, args, { env, stdio: ['ignore', descriptor, descriptor], windowsHide: false });
  } finally {
    // spawn duplicates these handles for the child; closing our copy is safe even
    // if the launcher later exits or its own terminal disappears.
    closeSync(descriptor);
  }
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
  try {
    const code = await new Promise((done, reject) => { child.once('error', reject); child.once('exit', done); });
    return { code, pid: child.pid, timedOut };
  } finally { clearTimeout(timer); }
}
