import { EventEmitter } from 'node:events';
import { spawn as spawnProcess } from 'node:child_process';
import type { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import type { DashboardState } from '../shared/contracts.ts';
import { isSnapshot } from '../shared/protocol.ts';
export interface CollectorOptions { executable: string; spawn?: typeof spawn; retryDelay?: number; readyTimeout?: number; staleTimeout?: number; log?: (message: string) => void }
export class CollectorClient extends EventEmitter {
  state: DashboardState = { snapshot: null, collector: { state: 'starting', message: null, lastSnapshotAt: null } };
  private options: CollectorOptions;
  private child: ChildProcessWithoutNullStreams | null = null;
  private restartCount = 0;
  private closed = false;
  private retryTimer: NodeJS.Timeout | null = null;
  private readyTimer: NodeJS.Timeout | null = null;
  private watchdog: NodeJS.Timeout | null = null;
  private receivedAt = 0;
  private checkedAt = 0;
  private requestIndex = 0;
  private pending = new Map<string, { resolve: () => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  private refreshing: Promise<void> | null = null;
  private lifecycle = 0;
  private retirements = new Set<Promise<void>>();
  constructor(options: CollectorOptions) { super(); this.options = options; }
  private update(state: DashboardState['collector']['state'], message: string | null) {
    this.state = { ...this.state, collector: { ...this.state.collector, state, message } }; this.emit('state', this.state);
  }
  start(): void {
    if (this.child || this.closed) return;
    this.update(this.restartCount ? 'reconnecting' : 'starting', null);
    let child: ChildProcessWithoutNullStreams;
    try {
      child = (this.options.spawn || spawnProcess)(this.options.executable, ['--parent', String(process.pid)], { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] }) as ChildProcessWithoutNullStreams;
    } catch { this.fail(null, '수집 프로그램을 시작하지 못했어요.'); return; }
    this.child = child;
    this.receivedAt = this.checkedAt = Date.now(); let buffer = '', diagnostics = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (this.child !== child) return;
      buffer += chunk;
      if (buffer.length > 4 * 1024 * 1024) { this.fail(child, '수집 데이터가 올바르지 않아요.'); return; }
      let end: number;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        if (line.trim()) this.message(line, child);
      }
    });
    child.stderr.on('data', (chunk: string) => {
      diagnostics = (diagnostics + chunk).slice(-4096);
      let end: number;
      while ((end = diagnostics.indexOf('\n')) >= 0) {
        const line = diagnostics.slice(0, end); diagnostics = diagnostics.slice(end + 1);
        try { const data = JSON.parse(line); if (/^[\w-]+$/.test(data.scope) && /^[\w-]+$/.test(data.code)) this.options.log?.(`collector ${data.scope}: ${data.code}`); } catch { }
      }
    });
    child.stdin.on('error', () => { if (this.child === child) this.fail(child, '수집 프로그램과 연결이 끊겼어요.'); });
    child.once('error', () => this.fail(child, '수집 프로그램을 실행하지 못했어요.'));
    child.once('close', () => this.fail(child, 'PC 정보 수집이 중단됐어요.'));
    this.readyTimer = setTimeout(() => this.fail(child, '수집 프로그램이 응답하지 않아요.'), this.options.readyTimeout ?? 12000);
    this.watchdog = setInterval(() => {
      const now = Date.now(), timeout = this.options.staleTimeout ?? 8000;
      // A suspended PC or stalled host loop must not spend the one automatic retry.
      if (now - this.checkedAt > timeout || now < this.checkedAt) { this.receivedAt = this.checkedAt = now; return; }
      this.checkedAt = now;
      if (now - this.receivedAt > timeout) this.fail(child, '새 PC 정보를 받지 못하고 있어요.');
    }, 2000);
  }
  private message(line: string, child: ChildProcessWithoutNullStreams) {
    if (this.child !== child) return;
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message?.type === 'snapshot' && isSnapshot(message.snapshot)) {
      if (this.readyTimer) clearTimeout(this.readyTimer); this.readyTimer = null;
      this.receivedAt = Date.now();
      this.state = { snapshot: message.snapshot, collector: { state: 'running', message: null, lastSnapshotAt: new Date().toISOString() } };
      this.emit('state', this.state);
    } else if (message?.type === 'response' && typeof message.id === 'string') {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id); clearTimeout(pending.timer);
      message.ok === true ? pending.resolve() : pending.reject(new Error('새로고침을 완료하지 못했어요.'));
    }
  }
  private clearTimers() {
    if (this.readyTimer) clearTimeout(this.readyTimer); if (this.watchdog) clearInterval(this.watchdog);
    this.readyTimer = this.watchdog = null;
  }
  private rejectPending() {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('수집 연결이 종료됐어요. 다시 시도해 주세요.')); }
    this.pending.clear();
  }
  private fail(child: ChildProcessWithoutNullStreams | null, message: string) {
    if (this.closed || child !== this.child) return;
    this.child = null; this.clearTimers(); this.rejectPending();
    if (child) { try { child.kill(); } catch { } }
    this.options.log?.('collector connection interrupted');
    if (this.restartCount < 1) {
      this.restartCount++; this.update('reconnecting', 'PC 정보 수집을 다시 연결하고 있어요.');
      this.retryTimer = setTimeout(() => { this.retryTimer = null; this.start(); }, this.options.retryDelay ?? 1000);
    } else this.update('error', message);
  }
  private request(action: 'refresh'): Promise<void> {
    const child = this.child;
    if (!child || this.state.collector.state !== 'running') return Promise.reject(new Error('PC 정보 수집에 연결한 뒤 다시 시도해 주세요.'));
    const id = `request-${++this.requestIndex}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('새로고침에 시간이 걸리고 있어요. 잠시 후 다시 시도해 주세요.')); }, 20000);
      this.pending.set(id, { resolve, reject, timer });
      try { child.stdin.write(JSON.stringify({ id, action }) + '\n'); }
      catch { clearTimeout(timer); this.pending.delete(id); reject(new Error('수집 프로그램에 요청을 보내지 못했어요.')); }
    });
  }
  refresh(): Promise<void> {
    if (!this.refreshing) this.refreshing = this.request('refresh').finally(() => { this.refreshing = null; });
    return this.refreshing;
  }
  notifyResume(): void { this.receivedAt = this.checkedAt = Date.now(); }
  async retry(): Promise<void> {
    if (this.closed) return;
    const lifecycle = ++this.lifecycle;
    if (this.retryTimer) clearTimeout(this.retryTimer); this.retryTimer = null;
    const old = this.child; this.child = null; this.clearTimers(); this.rejectPending();
    if (old) await this.retire(old);
    if (this.closed || lifecycle !== this.lifecycle) return;
    this.restartCount = 0; this.start();
  }
  private retire(child: ChildProcessWithoutNullStreams): Promise<void> {
    const task = this.terminate(child); this.retirements.add(task);
    void task.finally(() => this.retirements.delete(task)); return task;
  }
  private async terminate(child: ChildProcessWithoutNullStreams): Promise<void> {
    if (child.exitCode !== null) return;
    let timer: NodeJS.Timeout | undefined;
    await new Promise<void>((resolve) => {
      child.once('close', () => { if (timer) clearTimeout(timer); resolve(); });
      timer = setTimeout(() => { try { child.kill(); } catch { } resolve(); }, 2500);
      try { child.stdin.end(JSON.stringify({ id: 'shutdown', action: 'shutdown' }) + '\n'); } catch { try { child.kill(); } catch { } resolve(); }
    });
  }
  async stop(): Promise<void> {
    this.closed = true; this.lifecycle++; if (this.retryTimer) clearTimeout(this.retryTimer); this.retryTimer = null;
    this.clearTimers(); this.rejectPending(); const child = this.child; this.child = null;
    if (child) this.retire(child);
    await Promise.all([...this.retirements]);
  }
}
