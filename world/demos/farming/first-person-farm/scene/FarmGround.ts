import { gridSurfaceTriangles } from "@galacean/engine-terrain/geometry/SurfaceTriangles";
import type {
  FarmingGroundProvider,
  FarmingGroundView,
  FarmingGroundChange,
  GroundBounds,
  GroundFootprint,
  GroundRay,
  GroundHit,
  GroundSample,
  GroundSurface
} from "@galacean/engine-farming/farming/domain/FarmingGround";
import { boundsIntersect } from "@galacean/engine-farming/farming/domain/FarmingGround";

export const FARM_GROUND_ID = "farm-ground-v1";
const HALF = 16,
  STEP = 0.25,
  STRIDE = 129,
  EDIT_RADIUS = 2.5;
export interface FarmGroundObstacle {
  readonly bounds: GroundBounds;
}
interface Edit {
  x: number;
  z: number;
  delta: number;
}
const rock: GroundBounds = { minimumX: 5, maximumX: 7.5, minimumZ: -2.5, maximumZ: 0 };
/** Bounded, canonical heightfield used by both the case renderer and farming queries. */
export class FarmGround implements FarmingGroundProvider {
  private revision = 0;
  private view: FarmingGroundView;
  private edits: Edit[] = [];
  private readonly listeners = new Set<(change: FarmingGroundChange) => void>();
  constructor(private readonly obstacles: readonly FarmGroundObstacle[] = []) {
    this.view = this.buildView();
  }
  capture(): FarmingGroundView {
    return this.view;
  }
  subscribe(listener: (change: FarmingGroundChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  /** Debug-only host terrain authoring. Terrain saves are outside farming storage. */
  changeHeight(x: number, z: number, delta: number): void {
    if (![x, z, delta].every(Number.isFinite)) throw new Error("Invalid terrain edit");
    this.edits = [...this.edits, { x, z, delta }];
    // A changed native vertex affects each adjacent triangle, up to one cell away.
    // Publish the support of height/normal/slope facts, not just the edit brush.
    const affectedRadius = EDIT_RADIUS + STEP;
    this.publish({
      minimumX: x - affectedRadius,
      maximumX: x + affectedRadius,
      minimumZ: z - affectedRadius,
      maximumZ: z + affectedRadius
    });
  }
  reset(): void {
    this.edits = [];
    this.publish();
  }
  private publish(bounds?: GroundBounds): void {
    this.revision++;
    this.view = this.buildView();
    for (const listener of this.listeners) listener({ revision: this.revision, groundId: FARM_GROUND_ID, bounds });
  }
  private buildView(): FarmingGroundView {
    const heights = new Float32Array(STRIDE * STRIDE),
      edits = this.edits;
    for (let row = 0; row < STRIDE; row++)
      for (let col = 0; col < STRIDE; col++) {
        const x = -HALF + col * STEP,
          z = -HALF + row * STEP;
        let y = -0.04;
        const steepRadius = Math.hypot(x + 6, z + 6) / 3,
          gentleRadius = Math.hypot(x - 5.5, z + 7) / 3;
        if (steepRadius < 1) y += 0.91 * (1 - steepRadius * steepRadius) ** 2;
        if (gentleRadius < 1) y += 0.28 * (1 - gentleRadius * gentleRadius) ** 2;
        for (const edit of edits) {
          const r = Math.hypot(x - edit.x, z - edit.z) / EDIT_RADIUS;
          if (r < 1) {
            const t = 1 - r * r;
            y += edit.delta * t * t;
          }
        }
        heights[row * STRIDE + col] = y;
      }
    const sample = (groundId: string, x: number, z: number): GroundSample | null => {
      if (
        groundId !== FARM_GROUND_ID ||
        !Number.isFinite(x) ||
        !Number.isFinite(z) ||
        Math.abs(x) > HALF ||
        Math.abs(z) > HALF
      )
        return null;
      const gx = (x + HALF) / STEP,
        gz = (z + HALF) / STEP,
        col = Math.min(127, Math.floor(gx)),
        row = Math.min(127, Math.floor(gz)),
        u = gx - col,
        v = gz - row;
      const a = heights[row * STRIDE + col],
        b = heights[(row + 1) * STRIDE + col],
        c = heights[row * STRIDE + col + 1],
        d = heights[(row + 1) * STRIDE + col + 1];
      const lower = u + v <= 1;
      const dx = (lower ? c - a : d - b) / STEP,
        dz = (lower ? b - a : d - c) / STEP;
      const length = Math.hypot(dx, 1, dz);
      return {
        position: [x, lower ? a + (c - a) * u + (b - a) * v : d + (b - d) * (1 - u) + (c - d) * (1 - v), z],
        normal: [-dx / length, 1 / length, -dz / length],
        surface: inside(rock, x, z) ? "rock" : "grass"
      };
    };
    const inspectBounds = (groundId: string, bounds: GroundBounds): GroundFootprint => {
      const covered =
        groundId === FARM_GROUND_ID &&
        bounds.minimumX >= -HALF &&
        bounds.maximumX <= HALF &&
        bounds.minimumZ >= -HALF &&
        bounds.maximumZ <= HALF;
      let maximumSlopeDegrees = 0;
      if (covered) {
        // Inspect every intersecting native triangle, including a corner outside the centre sample.
        const minX = Math.max(0, Math.floor((bounds.minimumX + HALF) / STEP)),
          maxX = Math.min(127, Math.floor((bounds.maximumX + HALF) / STEP));
        const minZ = Math.max(0, Math.floor((bounds.minimumZ + HALF) / STEP)),
          maxZ = Math.min(127, Math.floor((bounds.maximumZ + HALF) / STEP));
        for (let row = minZ; row <= maxZ; row++)
          for (let col = minX; col <= maxX; col++) {
            const a = heights[row * STRIDE + col],
              b = heights[(row + 1) * STRIDE + col],
              c = heights[row * STRIDE + col + 1],
              d = heights[(row + 1) * STRIDE + col + 1];
            const x = -HALF + col * STEP,
              z = -HALF + row * STEP;
            const diagonal = x + z + STEP;
            // Clip to the cell before testing its diagonal: a nearby triangle outside the plot is irrelevant.
            if (Math.max(bounds.minimumX, x) + Math.max(bounds.minimumZ, z) <= diagonal)
              maximumSlopeDegrees = Math.max(
                maximumSlopeDegrees,
                (Math.atan(Math.hypot(c - a, b - a) / STEP) * 180) / Math.PI
              );
            if (Math.min(bounds.maximumX, x + STEP) + Math.min(bounds.maximumZ, z + STEP) >= diagonal)
              maximumSlopeDegrees = Math.max(
                maximumSlopeDegrees,
                (Math.atan(Math.hypot(d - b, d - c) / STEP) * 180) / Math.PI
              );
          }
      }
      return {
        covered,
        maximumSlopeDegrees,
        surfaces: boundsIntersect(bounds, rock) ? ["grass", "rock"] : ["grass"],
        blocked: this.obstacles.some((o) => boundsIntersect(o.bounds, bounds)),
        underwater: false
      };
    };
    return Object.freeze({
      revision: this.revision,
      surfaceTriangles: (id: string, bounds: GroundBounds) => id === FARM_GROUND_ID ? gridSurfaceTriangles(
        { origin: [-HALF, -HALF], spacing: STEP, spacingZ: STEP, columns: STRIDE, rows: STRIDE },
        bounds, (x, z) => heights[z * STRIDE + x], "bc") : [],
      sample,
      inspectBounds,
      raycast: (ray: GroundRay, maximumDistance: number): GroundHit | null => {
        const length = Math.hypot(...ray.direction);
        if (!length || !Number.isFinite(maximumDistance) || maximumDistance <= 0) return null;
        const direction = ray.direction.map((v) => v / length),
          [ox, oy, oz] = ray.origin;
        const at = (t: number) => sample(FARM_GROUND_ID, ox + direction[0] * t, oz + direction[2] * t);
        let previous = 0,
          previousGap = Infinity;
        for (let distance = 0; distance <= maximumDistance + 0.025; distance += 0.025) {
          const t = Math.min(distance, maximumDistance),
            point = at(t),
            gap = point ? oy + direction[1] * t - point.position[1] : Infinity;
          if (gap <= 0 && previousGap >= 0 && Number.isFinite(previousGap)) {
            let low = previous,
              high = t;
            for (let i = 0; i < 18; i++) {
              const mid = (low + high) / 2,
                m = at(mid);
              if (m && oy + direction[1] * mid <= m.position[1]) high = mid;
              else low = mid;
            }
            const hit = at(high)!;
            return { ...hit, groundId: FARM_GROUND_ID, distance: high };
          }
          previous = t;
          previousGap = gap;
        }
        return null;
      }
    });
  }
}
function inside(bounds: GroundBounds, x: number, z: number): boolean {
  return x >= bounds.minimumX && x <= bounds.maximumX && z >= bounds.minimumZ && z <= bounds.maximumZ;
}
export const FARM_GROUND_MESH = { half: HALF, step: STEP, stride: STRIDE } as const;
