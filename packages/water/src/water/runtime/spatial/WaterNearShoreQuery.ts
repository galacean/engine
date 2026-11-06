/** Static gameplay proximity, independent of raster/GPU support and wet/volume classification. */
export interface WaterNearShoreSample {
  /** Zero within the compiled positive-depth wet domain, otherwise Water's horizontal shore distance in metres. */
  distanceM: number;
  /** Static surface datum at that nearest point, not terrain height on the dry bank. */
  surfaceHeight: number;
}

export interface WaterNearShoreTask {
  /** Advance this one query; false keeps its private partial result unpublished. */
  advance(now?: () => number, budgetMs?: number): boolean;
  readonly hit: boolean;
}

export interface WaterNearShoreQuery {
  /** Finite supported dry-bank distance. This does not enlarge the physical water footprint. */
  readonly radiusM: number;
  /** Cooperative index preparation. False means pending; the consumer must retain its old complete cache. */
  prepare?(now?: () => number, budgetMs?: number): boolean;
  /** One query with cooperative continuations; out is valid only after advance returns true. */
  createTask?(x: number, z: number, out: WaterNearShoreSample): WaterNearShoreTask;
  sample(x: number, z: number, out: WaterNearShoreSample): boolean;
}

/** Includes a margin above the 20m gameplay radius and the supported spatial field errors. */
export const WATER_NEAR_SHORE_RADIUS_M = 32;

export function createWaterNearShoreSample(): WaterNearShoreSample {
  return { distanceM: Number.NaN, surfaceHeight: Number.NaN };
}

export function resetWaterNearShoreSample(out: WaterNearShoreSample): void {
  out.distanceM = out.surfaceHeight = Number.NaN;
}

/** Time and operation caps bound continuations even under a deterministic test clock. */
export function waterNearShoreTask(work: Generator<void, boolean>): WaterNearShoreTask {
  let done = false,
    hit = false;
  return {
    get hit() {
      return hit;
    },
    advance(now = () => performance.now(), budgetMs = 0.2) {
      if (done) return true;
      const start = now();
      for (let i = 0; i < 1024; i++) {
        const next = work.next();
        if (next.done) {
          hit = next.value;
          done = true;
          return true;
        }
        if (now() - start >= budgetMs) break;
      }
      return false;
    }
  };
}

export function guardWaterNearShoreTask(
  task: WaterNearShoreTask,
  out: WaterNearShoreSample,
  active: () => boolean,
  heightOffset = 0
): WaterNearShoreTask {
  let mapped = false;
  return {
    get hit() {
      return active() && task.hit;
    },
    advance(now, budgetMs) {
      if (!active()) {
        resetWaterNearShoreSample(out);
        return true;
      }
      const done = task.advance(now, budgetMs);
      if (done && !mapped) {
        if (task.hit) out.surfaceHeight += heightOffset;
        mapped = true;
      }
      return done;
    }
  };
}
