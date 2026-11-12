/** Owns the lifetime of plugin workers independently from the PC dashboard. */
export class PluginRuntime<T extends { stop(): Promise<void> }> {
  private service: T | null = null;
  private cleanup: Promise<void> = Promise.resolve();
  private generation = 0;
  private closed = false;
  private readonly factory: () => T;
  constructor(factory: () => T) { this.factory = factory; }
  get enabled(): boolean { return this.service !== null; }
  get current(): T { if (!this.service) throw new Error('플러그인 사용이 꺼져 있어요.'); return this.service; }
  async setEnabled(enabled: boolean): Promise<void> {
    if (enabled && this.closed) throw new Error('플러그인 실행이 종료되었어요.');
    if (enabled && this.service) return;
    const generation = ++this.generation;
    const retired = this.service;
    // Revoke synchronously, including requests arriving while cleanup awaits I/O.
    this.service = null;
    if (retired) this.cleanup = this.cleanup.then(() => retired.stop());
    await this.cleanup;
    if (enabled && !this.closed && generation === this.generation) this.service = this.factory();
  }
  async stop(): Promise<void> { this.closed = true; await this.setEnabled(false); }
}
