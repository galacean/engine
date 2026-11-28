import type { FarmClock } from "@galacean/engine-farming/farming/application/FarmClock";
import { FARM_APPROXIMATE_OFFLINE_MAX_CATCH_UP_MS } from "@galacean/engine-farming/farming/domain/FarmSimulation";
import type { FarmSnapshot } from "@galacean/engine-farming/farming/domain/FarmState";

export const PLANNING_FARM_OFFLINE_MAX_CATCH_UP_MS = FARM_APPROXIMATE_OFFLINE_MAX_CATCH_UP_MS;
export const PLANNING_FARM_BACKGROUND_APPROXIMATE_THRESHOLD_MS = 120_000;

export interface FarmWallClockAnchor {
  readonly savedAtWallMs: number;
  readonly snapshotTimeMs: number;
  readonly revision: number;
}

/** Resolve cross-session offline time only when the local save's wall-clock anchor matches the loaded snapshot. */
export function resolvePlanningOfflineElapsedMs(
  saved: Pick<FarmSnapshot, "revision" | "simulation"> | undefined,
  anchor: FarmWallClockAnchor | undefined,
  nowWallMs: number,
  stepMs: number,
  maximumElapsedMs?: number
): number {
  if (!saved || !anchor) return 0;
  if (anchor.snapshotTimeMs !== saved.simulation.lastSystemTimeMs || anchor.revision !== saved.revision) return 0;
  if (!Number.isFinite(nowWallMs) || nowWallMs <= anchor.savedAtWallMs) return 0;
  const rawElapsedMs = Math.floor(nowWallMs - anchor.savedAtWallMs);
  if (rawElapsedMs < stepMs) return 0;
  const safeLimit = Math.max(0, Number.MAX_SAFE_INTEGER - saved.simulation.lastSystemTimeMs);
  const limit = maximumElapsedMs === undefined ? safeLimit : Math.min(maximumElapsedMs, safeLimit);
  return Math.min(rawElapsedMs, limit);
}

/** Monotonic session clock anchored at savedTimeMs (plus any verified offline catch-up elapsed time on reload). */
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
