/** Frame-driven, forward-only world-clock transition. The lighting runtime owns its lifetime. */
export class TerrainTimeTransition {
  private _active?: {
    start: number;
    distance: number;
    duration: number;
    elapsed: number;
    resolve: () => void;
    reject: (error: Error) => void;
    cleanup: () => void;
  };

  constructor(private readonly _writeTime: (hours: number, finished: boolean, progress: number) => void) {}

  get active(): boolean {
    return this._active !== undefined;
  }

  start(
    current: number,
    target: number,
    duration: number,
    signal: AbortSignal,
    from?: number,
    retainDuration = false
  ): Promise<void> {
    if (signal.aborted) return Promise.reject(new Error("World time transition cancelled"));
    if (
      ![current, target, from ?? current].every((hour) => Number.isFinite(hour) && hour >= 0 && hour <= 24) ||
      !Number.isFinite(duration) ||
      duration < 0 ||
      duration > 60
    ) {
      return Promise.reject(new RangeError("Time must be 0–24 hours and transition duration 0–60 seconds"));
    }
    this.cancel("World time transition replaced by a new time update");
    const start = (from ?? current) % 24;
    const distance = ((target % 24) - start + 24) % 24;
    if (duration === 0 || (distance === 0 && !retainDuration)) {
      this._writeTime(target % 24, true, 1);
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const onAbort = () => this.cancel("World time transition cancelled");
      this._active = {
        start,
        distance,
        duration,
        elapsed: 0,
        resolve,
        reject,
        cleanup: () => signal.removeEventListener("abort", onAbort)
      };
      signal.addEventListener("abort", onAbort, { once: true });
      try {
        this._writeTime(start, false, 0);
      } catch (error) {
        this.cancel(error instanceof Error ? error.message : String(error));
      }
    });
  }

  update(deltaSeconds: number): void {
    const active = this._active;
    if (!active || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    active.elapsed = Math.min(active.duration, active.elapsed + deltaSeconds);
    const finished = active.elapsed >= active.duration;
    try {
      const progress = active.elapsed / active.duration;
      this._writeTime((active.start + active.distance * progress) % 24, finished, progress);
    } catch (error) {
      this.cancel(error instanceof Error ? error.message : String(error));
      return;
    }
    if (finished) {
      this._active = undefined;
      active.cleanup();
      active.resolve();
    }
  }

  cancel(message: string): void {
    const active = this._active;
    if (!active) return;
    this._active = undefined;
    active.cleanup();
    active.reject(new Error(message));
  }
}
