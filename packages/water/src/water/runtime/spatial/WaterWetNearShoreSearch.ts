import { WaterContourPreparation } from "./WaterContourPreparation";
import { float32GridCell, interpolateGridTriangle } from "@galacean/engine-terrain/geometry/GridInterpolation";
import {
  resolveWaterTerrainGrid,
  WATER_TERRAIN_OWNER_EPSILON,
  sampleWaterTerrainHeight,
  type WaterTerrainSnapshot
} from "../../authoring/terrain/WaterTerrainSnapshot";
import { sampleWaterConnection, type WaterConnectionPort } from "../../authoring/connections/WaterConnection";
import type { WaterNearShoreSample } from "./WaterNearShoreQuery";

export interface NearShoreBounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}
export const nearShoreBoundsDistanceSquared = (b: NearShoreBounds, x: number, z: number) =>
  Math.max(b.minX - x, 0, x - b.maxX) ** 2 + Math.max(b.minZ - z, 0, z - b.maxZ) ** 2;

const unroundedCoordinate = (value: number): number => value;

/** Conservative lower bed bound over the clipped cells of every possible owner.
 * Refinement seams may be discontinuous; both owners are included. A box merely
 * touching a refinement edge must not inherit a low vertex from its interior.
 * If maximumCells is exhausted, -Infinity means no dry-region proof is available.
 */
export function minimumWaterTerrainHeight(
  terrain: WaterTerrainSnapshot,
  b: NearShoreBounds,
  maximumCells = Infinity
): number {
  let minimum = Infinity;
  let cells = 0;
  for (let gridIndex = 0; gridIndex <= (terrain.refinements?.length ?? 0); gridIndex++) {
    const grid = gridIndex === 0 ? terrain : terrain.refinements![gridIndex - 1];
    const sx = grid.spacing,
      sz = grid.spacingZ ?? sx;
    const rounded = grid.surface === "float32-triangles",
      coordinate = rounded ? Math.fround : unroundedCoordinate;
    const leftEdge = coordinate(grid.origin[0]),
      bottomEdge = coordinate(grid.origin[1]),
      rightEdge = coordinate(grid.origin[0] + (grid.columns - 1) * sx),
      topEdge = coordinate(grid.origin[1] + (grid.rows - 1) * sz);
    const pad = grid === terrain ? 0 : WATER_TERRAIN_OWNER_EPSILON;
    if (
      b.maxX < Math.min(leftEdge, grid.origin[0] - sx * pad) ||
      b.minX > Math.max(rightEdge, grid.origin[0] + (grid.columns - 1) * sx + sx * pad) ||
      b.maxZ < Math.min(bottomEdge, grid.origin[1] - sz * pad) ||
      b.minZ > Math.max(topEdge, grid.origin[1] + (grid.rows - 1) * sz + sz * pad)
    )
      continue;
    const minX = Math.max(leftEdge, Math.min(rightEdge, b.minX)),
      maxX = Math.max(leftEdge, Math.min(rightEdge, b.maxX)),
      minZ = Math.max(bottomEdge, Math.min(topEdge, b.minZ)),
      maxZ = Math.max(bottomEdge, Math.min(topEdge, b.maxZ));
    const first = rounded ? float32GridCell({ ...grid, spacingZ: sz }, minX, minZ) : undefined,
      last = rounded ? float32GridCell({ ...grid, spacingZ: sz }, maxX, maxZ) : undefined;
    const x0 = first?.ix ?? Math.max(0, Math.min(grid.columns - 2, Math.floor((minX - grid.origin[0]) / sx))),
      x1 = last?.ix ?? Math.max(0, Math.min(grid.columns - 2, Math.floor((maxX - grid.origin[0]) / sx))),
      z0 = first?.iz ?? Math.max(0, Math.min(grid.rows - 2, Math.floor((minZ - grid.origin[1]) / sz))),
      z1 = last?.iz ?? Math.max(0, Math.min(grid.rows - 2, Math.floor((maxZ - grid.origin[1]) / sz)));
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        // A bounded pruning proof may be inconclusive. Never treat an unfinished
        // scan as dry: small replacement owners can contain the only wet region.
        if (++cells > maximumCells) return -Infinity;
        const left = coordinate(grid.origin[0] + x * sx),
          right = coordinate(grid.origin[0] + (x + 1) * sx),
          bottom = coordinate(grid.origin[1] + z * sz),
          top = coordinate(grid.origin[1] + (z + 1) * sz),
          u0 = Math.max(0, rounded ? (minX - left) / (right - left) : (minX - grid.origin[0]) / sx - x),
          u1 = Math.min(1, rounded ? (maxX - left) / (right - left) : (maxX - grid.origin[0]) / sx - x),
          v0 = Math.max(0, rounded ? (minZ - bottom) / (top - bottom) : (minZ - grid.origin[1]) / sz - z),
          v1 = Math.min(1, rounded ? (maxZ - bottom) / (top - bottom) : (maxZ - grid.origin[1]) / sz - z),
          i = z * grid.columns + x,
          a = grid.heights[i],
          c = grid.heights[i + grid.columns],
          d = grid.heights[i + grid.columns + 1],
          east = grid.heights[i + 1],
          fixed = rounded || grid !== terrain;
        if (a === east && a === c && a === d) {
          minimum = Math.min(minimum, a);
          continue;
        }
        const sample = (u: number, v: number) =>
          fixed
            ? interpolateGridTriangle(a, east, c, d, u, v)
            : (a * (1 - u) + east * u) * (1 - v) + (c * (1 - u) + d * u) * v;
        minimum = Math.min(minimum, sample(u0, v0), sample(u0, v1), sample(u1, v0), sample(u1, v1));
        const lo = Math.max(u0, v0),
          hi = Math.min(u1, v1);
        if (fixed && lo <= hi) minimum = Math.min(minimum, sample(lo, lo), sample(hi, hi));
      }
  }
  return minimum;
}

export type NearShorePoint = readonly [number, number];
type Point = readonly [number, number];
interface Segment extends NearShoreBounds {
  a: Point;
  b: Point;
  wet: Point;
}
interface Node extends NearShoreBounds {
  segment?: Segment;
  left?: Node;
  right?: Node;
}

/** Version-local wet contour, extracted once in cooperative preparation. Mixed cells
 * are resolved below half a compiler cell; crossings retain a native-verified wet endpoint. Queries
 * traverse only the immutable segment BVH, never grow an adaptive search tree.
 */
export class WaterWetNearShoreSearch {
  private tree?: Node;
  private ready = false;
  private preparation?: Generator<void>;
  private segments = 0;
  private samples = 0;
  private visits = 0;
  private preparationSteps = 0;
  private querySamples = 0;
  private cellCount = 0;
  private ownerBounds?: readonly NearShoreBounds[];
  constructor(
    private readonly root: NearShoreBounds,
    private readonly maximumHeight: number | ((b: NearShoreBounds) => number),
    private readonly wetHeight: (x: number, z: number) => number | undefined,
    private readonly geometryPossible: (b: NearShoreBounds) => boolean,
    private readonly terrain?: WaterTerrainSnapshot,
    private readonly connections?: readonly WaterConnectionPort[],
    private readonly extraPossible?: (b: NearShoreBounds) => boolean,
    private readonly splitGrid?: readonly [number, number, number, number],
    private readonly contours?: () => Generator<readonly [Point, Point] | undefined>,
    private readonly covered?: (bounds: NearShoreBounds) => boolean,
    private readonly geometryOptions?: {
      samples?: (bounds: NearShoreBounds) => Generator<Point>;
      contourDatum?: number;
      clipContour?: (a: Point, b: Point) => Generator<readonly [Point, Point] | undefined>;
      maximumHeightBound?: number;
      prepareGeometry?: (bounds: NearShoreBounds) => Generator<void>;
    }
  ) {}
  diagnostics() {
    return {
      builds: this.ready ? 1 : 0,
      cellCount: this.cellCount,
      segmentCount: this.segments,
      nodeCount: Math.max(0, 2 * this.segments - 1),
      preparationSamples: this.samples,
      preparationSteps: this.preparationSteps,
      querySamples: this.querySamples,
      queryVisits: this.visits
    };
  }
  *prepare(): Generator<void> {
    if (this.ready) return;
    this.preparation ??= this.build();
    while (!this.ready) {
      this.preparationSteps++;
      const next = this.preparation!.next();
      if (next.done) {
        this.ready = true;
        this.preparation = undefined;
      }
      yield;
    }
  }
  private *cells(): Generator<{ bounds: NearShoreBounds; grid?: WaterTerrainSnapshot; cell?: NearShoreBounds }> {
    const terrain = this.terrain;
    if (!terrain) {
      yield { bounds: this.root };
      return;
    }
    const intersect = (a: NearShoreBounds, b: NearShoreBounds): NearShoreBounds => ({
      minX: Math.max(a.minX, b.minX),
      minZ: Math.max(a.minZ, b.minZ),
      maxX: Math.min(a.maxX, b.maxX),
      maxZ: Math.min(a.maxZ, b.maxZ)
    });
    const extent = (g: WaterTerrainSnapshot): NearShoreBounds => ({
      minX: g.origin[0],
      minZ: g.origin[1],
      maxX: g.origin[0] + (g.columns - 1) * g.spacing,
      maxZ: g.origin[1] + (g.rows - 1) * (g.spacingZ ?? g.spacing)
    });
    for (const grid of [terrain, ...(terrain.refinements ?? [])]) {
      const sx = grid.spacing,
        sz = grid.spacingZ ?? sx,
        clip = intersect(this.root, extent(grid));
      const x0 = Math.max(0, Math.floor((clip.minX - grid.origin[0]) / sx)),
        x1 = Math.min(grid.columns - 2, Math.ceil((clip.maxX - grid.origin[0]) / sx) - 1);
      const z0 = Math.max(0, Math.floor((clip.minZ - grid.origin[1]) / sz)),
        z1 = Math.min(grid.rows - 2, Math.ceil((clip.maxZ - grid.origin[1]) / sz) - 1);
      const coordinate = (v: number) => (grid.surface === "float32-triangles" ? Math.fround(v) : v);
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) {
          const cell = {
            minX: coordinate(grid.origin[0] + x * sx),
            minZ: coordinate(grid.origin[1] + z * sz),
            maxX: coordinate(grid.origin[0] + (x + 1) * sx),
            maxZ: coordinate(grid.origin[1] + (z + 1) * sz)
          };
          let parts = [intersect(cell, clip)];
          if (grid === terrain)
            for (const patch of terrain.refinements ?? []) {
              const next: NearShoreBounds[] = [];
              for (const b of parts) {
                const cut = intersect(b, extent(patch));
                if (cut.minX >= cut.maxX || cut.minZ >= cut.maxZ) {
                  next.push(b);
                  continue;
                }
                if (b.minX < cut.minX) next.push({ ...b, maxX: cut.minX });
                if (cut.maxX < b.maxX) next.push({ ...b, minX: cut.maxX });
                if (b.minZ < cut.minZ) next.push({ minX: cut.minX, maxX: cut.maxX, minZ: b.minZ, maxZ: cut.minZ });
                if (cut.maxZ < b.maxZ) next.push({ minX: cut.minX, maxX: cut.maxX, minZ: cut.maxZ, maxZ: b.maxZ });
              }
              parts = next;
            }
          for (const bounds of parts)
            if (bounds.minX < bounds.maxX && bounds.minZ < bounds.maxZ) {
              this.cellCount++;
              yield { bounds, grid, cell };
            }
        }
    }
  }
  private ownershipEdge(a: Point, b: Point): boolean {
    const bounds = (this.ownerBounds ??= [
      this.root,
      ...(this.terrain
        ? [this.terrain, ...(this.terrain.refinements ?? [])].map((g) => ({
            minX: g.origin[0],
            minZ: g.origin[1],
            maxX: g.origin[0] + (g.columns - 1) * g.spacing,
            maxZ: g.origin[1] + (g.rows - 1) * (g.spacingZ ?? g.spacing)
          }))
        : [])
    ]);
    for (const r of bounds)
      if (
        (a[0] === b[0] &&
          (a[0] === r.minX || a[0] === r.maxX) &&
          Math.min(a[1], b[1]) >= r.minZ &&
          Math.max(a[1], b[1]) <= r.maxZ) ||
        (a[1] === b[1] &&
          (a[1] === r.minZ || a[1] === r.maxZ) &&
          Math.min(a[0], b[0]) >= r.minX &&
          Math.max(a[0], b[0]) <= r.maxX)
      )
        return true;
    return false;
  }
  private height(p: Point): number | undefined {
    this.samples++;
    return this.wetHeight(p[0], p[1]);
  }
  private *build(): Generator<void> {
    let nodes: Node[] = [];
    const heights = new Map<number, Map<number, number | undefined>>();
    const sampleHeight = (x: number, z: number) => {
      this.samples++;
      const datum = this.geometryOptions?.contourDatum;
      if (datum !== undefined && this.terrain) {
        const bed = sampleWaterTerrainHeight(this.terrain, x, z);
        return bed !== undefined && bed < datum ? datum : undefined;
      }
      return this.wetHeight(x, z);
    };
    const height = (p: Point) => {
      let row = heights.get(p[0]);
      if (!row) heights.set(p[0], (row = new Map()));
      if (!row.has(p[1])) row.set(p[1], sampleHeight(p[0], p[1]));
      return row.get(p[1]);
    };
    const cuts = new Map<number, Map<number, Map<number, Map<number, Point>>>>();
    const cachedCut = (wet: Point, dry: Point): Point | undefined =>
      cuts.get(wet[0])?.get(wet[1])?.get(dry[0])?.get(dry[1]);
    const storeCut = (wet: Point, dry: Point, point: Point): void => {
      let a = cuts.get(wet[0]);
      if (!a) cuts.set(wet[0], (a = new Map()));
      let b = a.get(wet[1]);
      if (!b) a.set(wet[1], (b = new Map()));
      let c = b.get(dry[0]);
      if (!c) b.set(dry[0], (c = new Map()));
      c.set(dry[1], point);
    };
    const add = (a: Point, b: Point, wet: Point) => {
      const segment = {
        a,
        b,
        wet,
        minX: Math.min(a[0], b[0]),
        maxX: Math.max(a[0], b[0]),
        minZ: Math.min(a[1], b[1]),
        maxZ: Math.max(a[1], b[1])
      };
      nodes.push({ ...segment, segment });
      this.segments++;
    };
    const crossing = function* (this: WaterWetNearShoreSearch, wet: Point, dry: Point): Generator<void, Point> {
      const cached = cachedCut(wet, dry);
      if (cached) return cached;
      if (this.terrain) {
        const datum = height(wet),
          a = sampleWaterTerrainHeight(this.terrain, wet[0], wet[1]),
          b = sampleWaterTerrainHeight(this.terrain, dry[0], dry[1]);
        if (datum !== undefined && a !== undefined && b !== undefined && b > a) {
          const t = (datum - a) / (b - a),
            length = Math.hypot(dry[0] - wet[0], dry[1] - wet[1]),
            e = 1e-9 / (length || 1);
          if (t > e && t <= 1) {
            const w: Point = [wet[0] + (dry[0] - wet[0]) * (t - e), wet[1] + (dry[1] - wet[1]) * (t - e)];
            const d: Point = [
              wet[0] + (dry[0] - wet[0]) * Math.min(1, t + e),
              wet[1] + (dry[1] - wet[1]) * Math.min(1, t + e)
            ];
            // Affine bed/level intersections are exact. Use them only with an
            // authoritative wet/dry bracket; curved/source-changing cases bisect.
            if (height(w) !== undefined && height(d) === undefined) {
              storeCut(wet, dry, w);
              yield;
              return w;
            }
            yield;
          }
        }
      }
      for (let i = 0; i < 25; i++) {
        const mid: Point = [(wet[0] + dry[0]) / 2, (wet[1] + dry[1]) / 2];
        if (height(mid) !== undefined) wet = mid;
        else dry = mid;
        yield;
      }
      storeCut(wet, dry, wet);
      return wet;
    }.bind(this);
    const scan = function* (
      this: WaterWetNearShoreSearch,
      b: NearShoreBounds,
      grid?: WaterTerrainSnapshot,
      cell?: NearShoreBounds
    ): Generator<void> {
      yield;
      const upper = this.geometryOptions?.maximumHeightBound;
      if (this.terrain && upper !== undefined && minimumWaterTerrainHeight(this.terrain, b) >= upper) return;
      if (this.geometryOptions?.prepareGeometry) yield* this.geometryOptions.prepareGeometry(b);
      if (!this.possible(b)) return;
      const mx = (b.minX + b.maxX) / 2,
        mz = (b.minZ + b.maxZ) / 2;
      const size = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
      // First split on the compiler lattice scale; only mixed/dry possible cells
      // need the finer gameplay contour. This bounds preparation independently of plots.
      const base = grid
        ? Math.min(grid.spacing, grid.spacingZ ?? grid.spacing)
        : Math.min(1, this.splitGrid ? Math.min(this.splitGrid[2], this.splitGrid[3]) : 1);
      if (size > base + 1e-9) {
        if (b.maxX - b.minX >= b.maxZ - b.minZ) {
          yield* scan({ ...b, maxX: mx }, grid, cell);
          yield* scan({ ...b, minX: mx }, grid, cell);
        } else {
          yield* scan({ ...b, maxZ: mz }, grid, cell);
          yield* scan({ ...b, minZ: mz }, grid, cell);
        }
        return;
      }
      const corners: Point[] = [
        [b.minX, b.minZ],
        [b.maxX, b.minZ],
        [b.maxX, b.maxZ],
        [b.minX, b.maxZ]
      ];
      const points: Point[] = [],
        diagonal: Point[] = [];
      const fixed = grid && (grid !== this.terrain || grid.surface === "float32-triangles") && cell;
      const side = (p: Point) =>
        fixed ? (p[0] - cell!.minX) / (cell!.maxX - cell!.minX) - (p[1] - cell!.minZ) / (cell!.maxZ - cell!.minZ) : 1;
      for (let i = 0; i < 4; i++) {
        const a = corners[i],
          c = corners[(i + 1) % 4],
          da = side(a),
          dc = side(c);
        points.push(a);
        if (da === 0) diagonal.push(a);
        if (da * dc < 0) {
          const t = da / (da - dc),
            p: Point = [a[0] + t * (c[0] - a[0]), a[1] + t * (c[1] - a[1])];
          points.push(p);
          diagonal.push(p);
        }
      }
      const boundaryCount = points.length;
      points.push(
        diagonal.length >= 2 ? [(diagonal[0][0] + diagonal[1][0]) / 2, (diagonal[0][1] + diagonal[1][1]) / 2] : [mx, mz]
      );
      const wet: boolean[] = [];
      for (const p of points) {
        wet.push(height(p) !== undefined);
        yield;
      }
      // A native triangle tolerance can form a thin but real corner island.
      // Probe actual geometry/box intersections before subdividing a dry sample
      // set; every added witness still passes the authoritative wet query.
      if (!wet.some(Boolean) && this.geometryOptions?.samples) {
        for (const p of this.geometryOptions?.samples(b)) {
          const hit = height(p) !== undefined;
          yield;
          if (hit) {
            points[boundaryCount] = p;
            wet[boundaryCount] = true;
            break;
          }
        }
      }
      let resolution = Math.min(0.25, base / 2);
      if (
        grid &&
        this.terrain &&
        wet.some(Boolean) &&
        !wet.every(Boolean) &&
        (this.geometryOptions?.contourDatum !== undefined || this.covered?.(b)) &&
        corners.every(([x, z]) => resolveWaterTerrainGrid(this.terrain!, x, z) === grid)
      ) {
        const h = corners.map(([x, z]) => sampleWaterTerrainHeight(this.terrain!, x, z));
        // A constant native datum over a fully covered convex span and an
        // affine bed has a straight exact contour; subdividing it adds no facts.
        if (h.every((v) => v !== undefined) && h[0]! + h[2] === h[1]! + h[3]!) resolution = base;
      }
      // possible() is a conservative proof. A dry sample set is not one: retain
      // the cell and continue even below the distance-accuracy scale until wet
      // support is found or the native bed/geometry bounds prove it impossible.
      if (!wet.every(Boolean) && (!wet.some(Boolean) || size > resolution)) {
        if ((mx === b.minX || mx === b.maxX) && (mz === b.minZ || mz === b.maxZ)) return;
        if (mx === b.minX || mx === b.maxX) {
          yield* scan({ ...b, maxZ: mz }, grid, cell);
          yield* scan({ ...b, minZ: mz }, grid, cell);
          return;
        }
        if (mz === b.minZ || mz === b.maxZ) {
          yield* scan({ ...b, maxX: mx }, grid, cell);
          yield* scan({ ...b, minX: mx }, grid, cell);
          return;
        }
        yield* scan({ ...b, maxX: mx, maxZ: mz }, grid, cell);
        yield* scan({ ...b, minX: mx, maxZ: mz }, grid, cell);
        yield* scan({ ...b, maxX: mx, minZ: mz }, grid, cell);
        yield* scan({ ...b, minX: mx, minZ: mz }, grid, cell);
        return;
      }
      for (let i = 0; i < boundaryCount; i++) {
        const j = (i + 1) % boundaryCount;
        const ids = [i, j, boundaryCount],
          cuts: Point[] = [];
        for (let k = 0; k < 3; k++) {
          const u = ids[k],
            v = ids[(k + 1) % 3];
          if (wet[u] !== wet[v]) cuts.push(yield* crossing(points[wet[u] ? u : v], points[wet[u] ? v : u]));
        }
        if (cuts.length === 2) add(cuts[0], cuts[1], points[ids.find((k) => wet[k])!]);
        // The finite source/primitive boundary is also a shore when wet.
        const a = points[i],
          c = points[j];
        const outer = this.ownershipEdge(a, c);
        if (outer && (wet[i] || wet[j])) {
          const edge = wet[i] === wet[j] ? undefined : yield* crossing(points[wet[i] ? i : j], points[wet[i] ? j : i]);
          add(wet[i] ? a : edge!, wet[j] ? c : edge!, points[wet[i] ? i : j]);
        }
      }
    }.bind(this);
    if (this.contours) {
      const preparation = new WaterContourPreparation(this.contours(), sampleHeight, add);
      while (!preparation.advance()) yield;
    } else
      for (const { bounds, grid, cell } of this.cells()) {
        yield;
        yield* scan(bounds, grid, cell);
      }
    if (this.geometryOptions?.clipContour) {
      // Scalar contours and ownership seams are clipped by actual native
      // geometry before becoming query support. No dry witness is published.
      const candidates = nodes;
      nodes = [];
      this.segments = 0;
      for (const candidate of candidates) {
        const segment = candidate.segment!;
        for (const part of this.geometryOptions.clipContour(segment.a, segment.b)) {
          yield;
          if (!part) continue;
          let [a, b] = part;
          const wet: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          if (this.height(wet) === undefined) continue;
          const endpoint = function* (this: WaterWetNearShoreSearch, p: Point): Generator<void, Point> {
            if (this.height(p) !== undefined) return p;
            let dry = p,
              inside = wet;
            for (let i = 0; i < 25; i++) {
              const mid: Point = [(dry[0] + inside[0]) / 2, (dry[1] + inside[1]) / 2];
              if (this.height(mid) === undefined) dry = mid;
              else inside = mid;
              yield;
            }
            return inside;
          }.bind(this);
          a = yield* endpoint(a);
          b = yield* endpoint(b);
          add(a, b, wet);
        }
      }
    }
    while (nodes.length > 1) {
      const next: Node[] = [];
      for (let i = 0; i < nodes.length; i += 2) {
        const a = nodes[i],
          b = nodes[i + 1];
        next.push(
          b
            ? {
                minX: Math.min(a.minX, b.minX),
                minZ: Math.min(a.minZ, b.minZ),
                maxX: Math.max(a.maxX, b.maxX),
                maxZ: Math.max(a.maxZ, b.maxZ),
                left: a,
                right: b
              }
            : a
        );
        yield;
      }
      nodes = next;
    }
    this.tree = nodes[0];
  }
  *search(x: number, z: number, out: WaterNearShoreSample): Generator<void> {
    yield* this.prepare();
    const visit = function* (this: WaterWetNearShoreSearch, node: Node): Generator<void> {
      this.visits++;
      yield;
      if (nearShoreBoundsDistanceSquared(node, x, z) > out.distanceM) return;
      if (node.segment) {
        const { a, b, wet } = node.segment,
          dx = b[0] - a[0],
          dz = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
        let wx = a[0] + t * dx,
          wz = a[1] + t * dz;
        if ((wx - x) ** 2 + (wz - z) ** 2 > out.distanceM) return;
        this.querySamples++;
        let height = this.wetHeight(wx, wz);
        yield;
        if (height === undefined) {
          // Contour chords may lie just outside a curved wet boundary. Retain
          // a verified wet-side point on this local contour, never a dry source.
          let lo = 0,
            hi = 1;
          for (let i = 0; i < 20; i++) {
            const m = (lo + hi) / 2;
            this.querySamples++;
            if (this.wetHeight(wx + (wet[0] - wx) * m, wz + (wet[1] - wz) * m) === undefined) lo = m;
            else hi = m;
            yield;
          }
          wx += (wet[0] - wx) * hi;
          wz += (wet[1] - wz) * hi;
          this.querySamples++;
          height = this.wetHeight(wx, wz);
          yield;
        }
        const d = (wx - x) ** 2 + (wz - z) ** 2;
        if (height !== undefined && d < out.distanceM) {
          out.distanceM = d;
          out.surfaceHeight = height;
        }
      } else if (node.left && node.right) {
        const [a, b] =
          nearShoreBoundsDistanceSquared(node.left, x, z) <= nearShoreBoundsDistanceSquared(node.right, x, z)
            ? [node.left, node.right]
            : [node.right, node.left];
        yield* visit(a);
        yield* visit(b);
      }
    }.bind(this);
    if (this.tree) yield* visit(this.tree);
  }

  private possible(b: NearShoreBounds): boolean {
    if (!this.geometryPossible(b) || (this.extraPossible && !this.extraPossible(b))) return false;
    // A connection cut is an intersection of a rectangle and half planes. All
    // four corners rejected by the same port prove the entire box is cut.
    for (const port of this.connections ?? []) {
      const corners = [
        [b.minX, b.minZ],
        [b.minX, b.maxZ],
        [b.maxX, b.minZ],
        [b.maxX, b.maxZ]
      ];
      if (corners.every(([x, z]) => !sampleWaterConnection([port], x, z).covered)) return false;
    }
    if (!this.terrain) return true;
    const t = this.terrain;
    if (
      b.maxX < t.origin[0] ||
      b.maxZ < t.origin[1] ||
      b.minX > t.origin[0] + (t.columns - 1) * t.spacing ||
      b.minZ > t.origin[1] + (t.rows - 1) * (t.spacingZ ?? t.spacing)
    )
      return false;
    const maximumHeight = typeof this.maximumHeight === "number" ? this.maximumHeight : this.maximumHeight(b);
    if (minimumWaterTerrainHeight(t, b) >= maximumHeight) return false;
    // Tighten within one actual owner/cell. For fixed triangles, include the
    // diagonal/rectangle intersections; rectangle corners alone are insufficient.
    const corners = [
      [b.minX, b.minZ],
      [b.minX, b.maxZ],
      [b.maxX, b.maxZ],
      [b.maxX, b.minZ]
    ];
    const g = resolveWaterTerrainGrid(t, b.minX, b.minZ),
      sx = g.spacing,
      sz = g.spacingZ ?? sx;
    const sameOwner =
      corners.every(([x, z]) => resolveWaterTerrainGrid(t, x, z) === g) &&
      (g !== t ||
        !(t.refinements ?? []).some(
          (p) =>
            p.origin[0] < b.maxX &&
            p.origin[1] < b.maxZ &&
            p.origin[0] + (p.columns - 1) * p.spacing > b.minX &&
            p.origin[1] + (p.rows - 1) * (p.spacingZ ?? p.spacing) > b.minZ
        ));
    const fixed = g !== t || g.surface === "float32-triangles";
    const cell =
      g.surface === "float32-triangles"
        ? float32GridCell({ ...g, spacingZ: sz }, b.minX, b.minZ)
        : {
            x0: g.origin[0] + Math.floor((b.minX - g.origin[0]) / sx) * sx,
            x1: g.origin[0] + (Math.floor((b.minX - g.origin[0]) / sx) + 1) * sx,
            z0: g.origin[1] + Math.floor((b.minZ - g.origin[1]) / sz) * sz,
            z1: g.origin[1] + (Math.floor((b.minZ - g.origin[1]) / sz) + 1) * sz
          };
    if (sameOwner && b.maxX <= cell.x1 && b.maxZ <= cell.z1) {
      const points = [...corners];
      if (fixed) {
        const side = (p: number[]) => (p[0] - cell.x0) / (cell.x1 - cell.x0) - (p[1] - cell.z0) / (cell.z1 - cell.z0);
        for (let i = 0; i < corners.length; i++) {
          const a = corners[i],
            c = corners[(i + 1) % corners.length],
            da = side(a),
            dc = side(c);
          if (da * dc < 0) {
            const u = da / (da - dc);
            points.push([a[0] + u * (c[0] - a[0]), a[1] + u * (c[1] - a[1])]);
          }
        }
      }
      if (
        points.every(([x, z]) => {
          const h = sampleWaterTerrainHeight(t, x, z);
          return h !== undefined && h >= maximumHeight;
        })
      )
        return false;
    }
    return true;
  }
}
