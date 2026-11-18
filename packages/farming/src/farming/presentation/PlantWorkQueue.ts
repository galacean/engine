const phaseProgress: Record<string, number> = {
  texture: -1,
  material: 0,
  geometry: 1,
  gpu: 2,
  tint: 3,
  growth: 4,
  shader: 5,
  "shader-submit": 5,
  "shader-poll": 5,
  publish: 6
};

/** Cancellable synchronous GPU/geometry work, admitted only during a visible render frame. */
export class PlantWorkQueue {
  private readonly pending: { id: string; phase: string; run(): void; cancel(): void }[] = [];
  readonly stats = {
    queued: 0,
    frameJobs: 0,
    frameMilliseconds: 0,
    budgetOverruns: 0,
    totalJobs: 0,
    maxJobMilliseconds: 0,
    phases: {} as Record<string, { jobs: number; totalMilliseconds: number; maxMilliseconds: number }>
  };
  enqueue<T>(id: string, signal: AbortSignal, work: () => T, phase = "allocation"): Promise<T> {
    return new Promise((resolve, reject) => {
      const remove = () => {
        const index = this.pending.indexOf(job);
        if (index >= 0) this.pending.splice(index, 1);
        signal.removeEventListener("abort", job.cancel);
        this.stats.queued = this.pending.length;
      };
      const job = {
        id,
        phase,
        run: () => {
          remove();
          try {
            signal.throwIfAborted();
            resolve(work());
          } catch (error) {
            reject(error);
          }
        },
        cancel: () => {
          remove();
          reject(signal.reason ?? new Error("Plant creation cancelled"));
        }
      };
      if (signal.aborted) {
        job.cancel();
        return;
      }
      this.pending.push(job);
      this.stats.queued = this.pending.length;
      signal.addEventListener("abort", job.cancel, { once: true });
    });
  }
  tick(priority: (id: string) => number, budgetMs: number, hidden = false): number {
    const start = performance.now();
    this.stats.frameJobs = this.stats.frameMilliseconds = 0;
    if (hidden) return 0;
    // Finish an admitted plant before preparing the whole batch. Host visibility/
    // selection still wins; stable sort preserves arrival order at equal progress.
    this.pending.sort(
      (a, b) => priority(b.id) - priority(a.id) || (phaseProgress[b.phase] ?? 0) - (phaseProgress[a.phase] ?? 0)
    );
    while (this.pending.length && priority(this.pending[0].id) >= 0) {
      if (this.stats.frameJobs && performance.now() - start >= budgetMs) break;
      const job = this.pending[0],
        jobStart = performance.now();
      job.run();
      const elapsed = performance.now() - jobStart;
      const phase = (this.stats.phases[job.phase] ??= { jobs: 0, totalMilliseconds: 0, maxMilliseconds: 0 });
      phase.jobs++;
      phase.totalMilliseconds += elapsed;
      phase.maxMilliseconds = Math.max(phase.maxMilliseconds, elapsed);
      this.stats.maxJobMilliseconds = Math.max(this.stats.maxJobMilliseconds, elapsed);
      this.stats.frameJobs++;
      this.stats.totalJobs++;
    }
    this.stats.frameMilliseconds = performance.now() - start;
    if (this.stats.frameJobs && this.stats.frameMilliseconds > budgetMs) this.stats.budgetOverruns++;
    return this.stats.frameMilliseconds;
  }
}
