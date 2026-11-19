import type { FarmClock } from "@galacean/engine-farming/farming/application/FarmClock";

/** Page lifetime only; a surviving background tab still accrues elapsed time. */
export class PlanningFarmClock implements FarmClock {
  private startedAt: number;
  constructor(
    private savedTimeMs = Date.now(),
    private readonly runtimeNow: () => number = () => performance.now()
  ) {
    this.startedAt = runtimeNow();
  }
  nowMs(): number {
    return this.savedTimeMs + Math.floor(Math.max(0, this.runtimeNow() - this.startedAt));
  }
  rebase(lastSystemTimeMs: number): void {
    this.savedTimeMs = lastSystemTimeMs;
    this.startedAt = this.runtimeNow();
  }
}
