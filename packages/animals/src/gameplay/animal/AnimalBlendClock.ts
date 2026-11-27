/**
 * Native fades use destination animation time, which changes with stride cadence.
 * Convert a simulation-second budget to that clock without changing authored poses.
 * A short one-shot can finish during a fade; its tree-selected successor inherits the remainder.
 */
export class AnimalBlendClock {
  remaining = 0;
  private duration = 0;
  private elapsed = 0;
  private animationElapsed = 0;

  start(seconds: number): void {
    this.remaining = this.duration = seconds;
    this.elapsed = this.animationElapsed = 0;
  }

  /** Fixed native duration whose end-of-step weight equals the simulation-time progress. */
  advance(seconds: number, animationSeconds: number): number {
    if (this.remaining <= 0) return 0;
    this.elapsed += seconds;
    this.animationElapsed += animationSeconds;
    this.remaining = Math.max(0, this.duration - this.elapsed);
    return this.animationElapsed / Math.min(1, this.elapsed / this.duration);
  }
}
