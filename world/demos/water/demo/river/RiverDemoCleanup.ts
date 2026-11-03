/** Releases acquired demo resources in reverse order, including partially initialized scenes. */
export class RiverDemoCleanup {
  private readonly actions: (() => void | Promise<void>)[] = [];
  private completion?: Promise<void>;

  defer(action: () => void | Promise<void>): void {
    if (this.completion) throw new Error("River cleanup has already started.");
    this.actions.push(action);
  }

  dispose(): Promise<void> {
    return (this.completion ??= Promise.resolve().then(async () => {
      const errors: unknown[] = [];
      for (const action of this.actions.reverse()) {
        try {
          await action();
        } catch (error) {
          errors.push(error);
        }
      }
      this.actions.length = 0;
      if (errors.length) throw new AggregateError(errors, "River resource cleanup failed.");
    }));
  }
}
