import type { FarmClock } from "@galacean/engine-farming/farming/application/FarmClock";

/** Page lifetime only; a surviving background tab still accrues elapsed time. */
export class PlanningFarmClock implements FarmClock {
  private readonly startedAt: number;
  constructor(
    private readonly savedTimeMs = Date.now(),
    private readonly runtimeNow: () => number = () => performance.now()
  ) {
    this.startedAt = runtimeNow();
  }
  nowMs(): number {
    return this.savedTimeMs + Math.floor(Math.max(0, this.runtimeNow() - this.startedAt));
  }
}
