/** A terrain frame and its derived geometry are accepted together. At most one
 * preparation is in flight; elapsed time coalesces rather than queuing work. */
export interface PreparedTerrainDependents {
  commit(): void;
  discard(): void;
}
export class SeedWorldTerrainFrameGate<T> {
  private pending?: Promise<void>;
  private controller?: AbortController;
  private paused = 0;
  private disposed = false;
  private failed = false;
  constructor(
    private prepare: (frame: T, signal: AbortSignal) => Promise<PreparedTerrainDependents>,
    private publish: (frame: T) => void,
    private onError: (error: unknown) => void
  ) {}
  get busy() {
    return !!this.pending || this.paused > 0 || this.disposed || this.failed;
  }
  request(frame: T): void {
    if (this.busy) return;
    const controller = (this.controller = new AbortController());
    this.pending = Promise.resolve()
      .then(() => this.prepare(frame, controller.signal))
      .then((candidate) => {
        if (controller.signal.aborted || this.disposed || this.paused) {
          candidate.discard();
          return;
        }
        try {
          candidate.commit();
          this.publish(frame);
        } catch (error) {
          candidate.discard();
          throw error;
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted && !this.disposed) {
          this.failed = true;
          this.onError(error);
        }
      })
      .finally(() => {
        this.pending = undefined;
      });
  }
  /** Stop advancement before borrowing this scene as an edit's starting state.
   * Drain/discard staged geometry before another preparation uses its runtime. */
  async pause(): Promise<() => void> {
    this.paused++;
    this.controller?.abort();
    await this.pending;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.paused--;
      }
    };
  }
  dispose(): void {
    this.disposed = true;
    this.controller?.abort();
  }
}
