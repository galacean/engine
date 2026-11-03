/** Session-only diagnostic switch. Serialize activation and teardown with scene rebinds. */
export class PlanningFarmingSwitch {
  enabled = true;
  error: string | undefined;
  diagnostic: { id: string; occurredAt: string; message: string } | undefined;
  private queue: Promise<void> = Promise.resolve();
  constructor(private readonly reconcile: (enabled: boolean) => Promise<void>) {}
  refresh(): Promise<void> {
    const task = this.queue.then(async () => {
      try {
        await this.reconcile(this.enabled);
        this.error = undefined;
        this.diagnostic = undefined;
      } catch (error) {
        this.error = String(error);
        this.diagnostic = { id: "farming-runtime", occurredAt: new Date().toISOString(), message: this.error };
        throw error;
      }
    });
    this.queue = task.catch(() => undefined);
    return task;
  }
  setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled;
    return this.refresh();
  }
}
