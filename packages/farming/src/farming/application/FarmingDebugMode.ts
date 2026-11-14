/** Host-owned presentation mode. It never changes farm state, simulation, or saves. */
export class FarmingDebugMode {
  private active = false;
  private disposed = false;
  private readonly listeners = new Set<(enabled: boolean) => void>();

  get enabled(): boolean {
    return this.active;
  }

  setEnabled(enabled: boolean): void {
    if (this.disposed) throw new Error("DESTROYED: FarmingDebugMode 已销毁");
    if (typeof enabled !== "boolean") throw new Error("INVALID_ARGUMENT: debug 必须为布尔值");
    if (this.active === enabled) return;
    this.active = enabled;
    for (const listener of this.listeners) listener(enabled);
  }

  subscribe(listener: (enabled: boolean) => void): () => void {
    if (this.disposed) throw new Error("DESTROYED: FarmingDebugMode 已销毁");
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    if (this.disposed) return;
    this.setEnabled(false);
    this.disposed = true;
    this.listeners.clear();
  }
}
