import { sampleWaterTerrainHeight } from "../../authoring/terrain/WaterTerrainSnapshot";
import type { HeightfieldWaterCompiledData } from "../../compiler/heightfield/HeightfieldWaterCompiledTypes";
import {
  HeightfieldWaterBaseQueryService,
  createHeightfieldWaterBaseQueryResult
} from "./HeightfieldWaterQueryService";
import {
  WATER_NEAR_SHORE_RADIUS_M,
  resetWaterNearShoreSample,
  waterNearShoreTask,
  type WaterNearShoreQuery,
  type WaterNearShoreSample
} from "../spatial/WaterNearShoreQuery";
import { WaterWetNearShoreSearch, type NearShorePoint } from "../spatial/WaterWetNearShoreSearch";
/** Positive-depth source support intersected with the authored/compiled Lake rings.
 * The extracted wet contour and its BVH belong to this immutable compilation.
 */
class HeightfieldNearShoreQuery implements WaterNearShoreQuery {
  readonly radiusM = WATER_NEAR_SHORE_RADIUS_M;
  private contour?: WaterWetNearShoreSearch;
  private query?: HeightfieldWaterBaseQueryService;
  private readonly result = createHeightfieldWaterBaseQueryResult();
  private preparation?: Generator<void, WaterWetNearShoreSearch>;
  constructor(private readonly data: HeightfieldWaterCompiledData) {
    // The contour walker's first optimizing compile is a multi-millisecond pause.
    // Pay it when the immutable query is created, and leave the index cooperative.
    this.preparation = this.build();
    for (let i = 0; i < 512; i++) {
      const next = this.preparation.next();
      if (!next.done) continue;
      this.contour = next.value;
      this.preparation = undefined;
      return;
    }
  }
  private wetHeight = (x: number, z: number) => {
    this.query ??= new HeightfieldWaterBaseQueryService(this.data);
    this.query.sampleBaseSurfaceLocal(x, z, this.result);
    return this.result.inside && this.result.depth > 0 ? this.result.surfaceHeight : undefined;
  };
  prepare = (now: () => number = () => performance.now(), budgetMs = 0.2): boolean => {
    if (this.contour) return true;
    this.preparation ??= this.build();
    const start = now();
    for (let i = 0; i < 1024; i++) {
      const next = this.preparation.next();
      if (next.done) {
        this.contour = next.value;
        this.preparation = undefined;
        return true;
      }
      if (now() - start >= budgetMs) break;
    }
    return false;
  };
  private *build(): Generator<void, WaterWetNearShoreSearch> {
    const q = this.data.queryGrid!,
      g = q.grid,
      boundary = this.data.lakeBoundary!;
    const b = {
      minX: g.originXZ[0] - g.cellSizeXZ[0] / 2,
      minZ: g.originXZ[1] - g.cellSizeXZ[1] / 2,
      maxX: g.originXZ[0] + (g.width - 0.5) * g.cellSizeXZ[0],
      maxZ: g.originXZ[1] + (g.height - 0.5) * g.cellSizeXZ[1]
    };
    const contours = function* (
      this: HeightfieldNearShoreQuery
    ): Generator<readonly [NearShorePoint, NearShorePoint] | undefined> {
      // Interpolation support and nearest-texel ownership are separate boundaries.
      for (let z = 0; z < g.height; z++)
        for (let x = 0; x < g.width; x++) {
          yield;
          const i = z * g.width + x;
          if (!q.wetMask.at(i)) continue;
          const px = g.originXZ[0] + x * g.cellSizeXZ[0],
            pz = g.originXZ[1] + z * g.cellSizeXZ[1];
          const hx = g.cellSizeXZ[0] / 2,
            hz = g.cellSizeXZ[1] / 2;
          if (x === 0 || !q.wetMask.at(i - 1))
            yield [
              [px - hx, pz - hz],
              [px - hx, pz + hz]
            ];
          if (x === g.width - 1 || !q.wetMask.at(i + 1))
            yield [
              [px + hx, pz - hz],
              [px + hx, pz + hz]
            ];
          if (z === 0 || !q.wetMask.at(i - g.width))
            yield [
              [px - hx, pz - hz],
              [px + hx, pz - hz]
            ];
          if (z === g.height - 1 || !q.wetMask.at(i + g.width))
            yield [
              [px - hx, pz + hz],
              [px + hx, pz + hz]
            ];
        }
      // Positive-depth isolines on the canonical bed lattice. Sampling the same
      // scalar field at source cells preserves zero-depth plateaus and dry islands.
      const terrain = q.bedTerrain;
      const grids = terrain ? [terrain, ...(terrain.refinements ?? [])] : [undefined];
      for (const grid of grids) {
        const sx = grid?.spacing ?? g.cellSizeXZ[0],
          sz = grid ? (grid.spacingZ ?? sx) : g.cellSizeXZ[1];
        const ox = grid?.origin[0] ?? g.originXZ[0],
          oz = grid?.origin[1] ?? g.originXZ[1];
        const columns = grid?.columns ?? g.width,
          rows = grid?.rows ?? g.height;
        const x0 = Math.max(0, Math.floor((b.minX - ox) / sx)),
          x1 = Math.min(columns - 1, Math.ceil((b.maxX - ox) / sx));
        const z0 = Math.max(0, Math.floor((b.minZ - oz) / sz)),
          z1 = Math.min(rows - 1, Math.ceil((b.maxZ - oz) / sz));
        if (grid && grid !== terrain) {
          const ex = ox + (columns - 1) * sx,
            ez = oz + (rows - 1) * sz;
          yield [
            [ox, oz],
            [ex, oz]
          ];
          yield [
            [ex, oz],
            [ex, ez]
          ];
          yield [
            [ex, ez],
            [ox, ez]
          ];
          yield [
            [ox, ez],
            [ox, oz]
          ];
        }
        const depth = (x: number, z: number) =>
          grid
            ? boundary.waterLevel -
              (sampleWaterTerrainHeight(terrain!, ox + x * sx, oz + z * sz) ?? boundary.waterLevel)
            : q.surfaceHeights.at(z * g.width + x)! - q.bedHeights.at(z * g.width + x)!;
        for (let z = z0; z < z1; z++)
          for (let x = x0; x < x1; x++) {
            yield;
            const corners = [depth(x, z), depth(x + 1, z), depth(x + 1, z + 1), depth(x, z + 1)];
            if (corners.every((d) => d > 0) || corners.every((d) => d <= 0)) continue;
            // A bilinear contour is curved; split mixed cells once so its chord
            // error stays within half a source spacing. Fixed triangles stay exact.
            const subdivisions = grid && grid === terrain && grid.surface !== "float32-triangles" ? 2 : 1;
            const step = 1 / subdivisions;
            for (let dz = 0; dz < subdivisions; dz++)
              for (let dx = 0; dx < subdivisions; dx++) {
                const u = x + dx * step,
                  v = z + dz * step;
                const points: NearShorePoint[] = [
                  [ox + u * sx, oz + v * sz],
                  [ox + (u + step) * sx, oz + v * sz],
                  [ox + (u + step) * sx, oz + (v + step) * sz],
                  [ox + u * sx, oz + (v + step) * sz]
                ];
                const depths = [depth(u, v), depth(u + step, v), depth(u + step, v + step), depth(u, v + step)];
                for (const ids of [
                  [0, 1, 2],
                  [0, 2, 3]
                ]) {
                  const cuts: NearShorePoint[] = [];
                  for (let k = 0; k < 3; k++) {
                    const u = ids[k],
                      v = ids[(k + 1) % 3];
                    if (depths[u] > 0 === depths[v] > 0) continue;
                    const t = depths[u] / (depths[u] - depths[v]);
                    cuts.push([
                      points[u][0] + t * (points[v][0] - points[u][0]),
                      points[u][1] + t * (points[v][1] - points[u][1])
                    ]);
                  }
                  if (cuts.length === 2) yield [cuts[0], cuts[1]];
                }
              }
          }
      }
      for (const port of this.data.connections ?? []) {
        const [cx, cz] = port.center,
          [nx, nz] = port.normal,
          r = port.halfWidth;
        yield [
          [cx - nz * r, cz + nx * r],
          [cx + nz * r, cz - nx * r]
        ];
        const length = Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ) * 2;
        for (const side of [-1, 1]) {
          const x = cx + side * nz * r,
            z = cz - side * nx * r;
          yield [
            [x - nx * length, z - nz * length],
            [x + nx * length, z + nz * length]
          ];
        }
        const [x0, z0, x1, z1] = port.coverageBounds;
        yield [
          [x0, z0],
          [x1, z0]
        ];
        yield [
          [x1, z0],
          [x1, z1]
        ];
        yield [
          [x1, z1],
          [x0, z1]
        ];
        yield [
          [x0, z1],
          [x0, z0]
        ];
      }
      for (const ring of boundary.rings)
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i],
            c = ring[(i + 1) % ring.length];
          yield [a, c];
          const tolerance = boundary.terrainShorelineTolerance ?? 0,
            dx = c[0] - a[0],
            dz = c[1] - a[1],
            length = Math.hypot(dx, dz);
          if (tolerance > 0 && length > 0)
            for (const sign of [-1, 1]) {
              const ox = ((sign * dz) / length) * tolerance,
                oz = ((-sign * dx) / length) * tolerance;
              yield [
                [a[0] + ox, a[1] + oz],
                [c[0] + ox, c[1] + oz]
              ];
            }
        }
    }.bind(this);
    const search = new WaterWetNearShoreSearch(
      b,
      boundary.waterLevel,
      this.wetHeight,
      () => true,
      undefined,
      undefined,
      undefined,
      undefined,
      contours
    );
    yield* search.prepare();
    return search;
  }
  diagnostics() {
    return this.contour?.diagnostics();
  }
  createTask(x: number, z: number, out: WaterNearShoreSample) {
    return waterNearShoreTask(this.search(x, z, out));
  }
  sample(x: number, z: number, out: WaterNearShoreSample): boolean {
    const task = this.createTask(x, z, out);
    while (!task.advance()) {
      /* Static direct API; frame consumers advance cooperatively. */
    }
    return task.hit;
  }
  private *search(x: number, z: number, out: WaterNearShoreSample): Generator<void, boolean> {
    resetWaterNearShoreSample(out);
    yield;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    while (!this.prepare()) {
      yield;
    }
    const height = this.wetHeight(x, z);
    if (height !== undefined) {
      out.distanceM = 0;
      out.surfaceHeight = height;
      return true;
    }
    out.distanceM = (this.radiusM + 1e-7) ** 2;
    yield* this.contour!.search(x, z, out);
    if (!Number.isFinite(out.surfaceHeight)) {
      resetWaterNearShoreSample(out);
      return false;
    }
    out.distanceM = Math.sqrt(out.distanceM);
    return true;
  }
}
const queries = new WeakMap<HeightfieldWaterCompiledData, HeightfieldNearShoreQuery>();
export function heightfieldNearShoreQuery(data: HeightfieldWaterCompiledData): HeightfieldNearShoreQuery {
  let query = queries.get(data);
  if (!query) {
    query = new HeightfieldNearShoreQuery(data);
    queries.set(data, query);
  }
  return query;
}
