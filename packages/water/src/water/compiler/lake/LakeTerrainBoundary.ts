import { float32GridCell, sampleFloat32GridTriangle } from "@galacean/engine-terrain/geometry/GridInterpolation";
import { LAKE_BOUNDARY_EPSILON } from "./LakeBoundaryCompiler";
import {
  sampleBilinearGridHeight,
  resolveWaterTerrainGrid,
  type WaterTerrainSnapshot
} from "../../authoring/terrain/WaterTerrainSnapshot";
import type { LakeBoundaryV1, LakePointXZ } from "../../authoring/lake/LakeBoundary";
import type { HeightfieldWaterGridConfig } from "../../authoring/heightfield/HeightfieldWaterTypes";

/** A bounded raster view. bedTerrain retains the canonical mixed bilinear / fixed-triangle topology. */
export interface LakeTerrainSnapshot {
  readonly grid: HeightfieldWaterGridConfig;
  readonly heights: Float32Array;
  readonly hash: string;
  readonly bedTerrain?: WaterTerrainSnapshot;
}

export type LakeTerrainView = Pick<LakeTerrainSnapshot, "grid" | "heights" | "bedTerrain">;

/** Bilinear marching squares with an asymptotic saddle decider.
 * Vertices lie on the exact isoline; rational-curve chord error is bounded by 0.025 m.
 * Refinement cells intersect their original fixed triangles exactly; queries retain the same canonical bed.
 */
export function resolveLakeTerrainBoundary(
  terrain: LakeTerrainView,
  waterLevel: number,
  /** Optional host basin scope. Ignore disjoint contours outside it, never alter bed heights.
   * A contour intersecting this scope must still be closed and valid.
   */
  includesContourPoint?: (x: number, z: number) => boolean
): LakeBoundaryV1 {
  const { grid, heights } = terrain;
  if (
    !Number.isFinite(waterLevel) ||
    !Number.isInteger(grid.width) ||
    grid.width < 2 ||
    !Number.isInteger(grid.height) ||
    grid.height < 2 ||
    !grid.originXZ.every(Number.isFinite) ||
    !grid.cellSizeXZ.every((size) => Number.isFinite(size) && size > 0) ||
    heights.length !== grid.width * grid.height ||
    heights.some((h) => !Number.isFinite(h))
  )
    throw new Error("Lake terrain has invalid heights or water level.");
  const coordinate = terrain.bedTerrain?.surface === "float32-triangles" ? Math.fround : (value: number) => value;
  const point = (index: number): LakePointXZ => [
    coordinate(grid.originXZ[0] + (index % grid.width) * grid.cellSizeXZ[0]),
    coordinate(grid.originXZ[1] + Math.floor(index / grid.width) * grid.cellSizeXZ[1])
  ];
  let contourPointCount = 0;
  const points = new Map<string, LakePointXZ>();
  const links = new Map<string, Set<string>>();
  const pointBuckets = new Map<string, string[]>();
  const remember = (p: LakePointXZ): string => {
    // Match by the existing metre-space Lake geometry tolerance, independent of world origin.
    const x = Math.floor((p[0] - grid.originXZ[0]) / LAKE_BOUNDARY_EPSILON);
    const z = Math.floor((p[1] - grid.originXZ[1]) / LAKE_BOUNDARY_EPSILON);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        for (const key of pointBuckets.get(`${x + dx}:${z + dz}`) ?? []) {
          const other = points.get(key)!;
          if (Math.hypot(p[0] - other[0], p[1] - other[1]) < LAKE_BOUNDARY_EPSILON) return key;
        }
      }
    const key = `p${points.size}`,
      bucketKey = `${x}:${z}`;
    const bucket = pointBuckets.get(bucketKey) ?? [];
    bucket.push(key);
    pointBuckets.set(bucketKey, bucket);
    points.set(key, p);
    return key;
  };
  const crossing = (a: LakePointXZ, b: LakePointXZ, ha: number, hb: number): string => {
    // Evaluate a shared edge in the same direction in both neighbours, including near-zero coordinates.
    if (a[0] > b[0] || (a[0] === b[0] && a[1] > b[1])) [a, b, ha, hb] = [b, a, hb, ha];
    const t = (waterLevel - ha) / (hb - ha);
    return remember([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  };
  const tolerance = 0.025;
  const link = (from: string, to: string) => {
    if (from === to) return;
    if (!links.has(from)) links.set(from, new Set());
    if (!links.has(to)) links.set(to, new Set());
    links.get(from)!.add(to);
    links.get(to)!.add(from);
  };
  const sourceAt = (x: number, z: number) =>
    terrain.bedTerrain ? resolveWaterTerrainGrid(terrain.bedTerrain, x, z) : undefined;
  const hasFixedTriangles = (source: WaterTerrainSnapshot) =>
    source !== terrain.bedTerrain || source.surface === "float32-triangles";
  const sampleSource = (source: WaterTerrainSnapshot, p: LakePointXZ) =>
    source.surface === "float32-triangles"
      ? sampleFloat32GridTriangle(
          { ...source, spacingZ: source.spacingZ ?? source.spacing },
          p[0],
          p[1],
          (x, z) => source.heights[z * source.columns + x]
        )
      : sampleBilinearGridHeight(
          source.heights,
          source.columns,
          source.rows,
          Math.max(0, Math.min(source.columns - 1, (p[0] - source.origin[0]) / source.spacing)),
          Math.max(0, Math.min(source.rows - 1, (p[1] - source.origin[1]) / (source.spacingZ ?? source.spacing))),
          source !== terrain.bedTerrain
        )!;
  const triangleDiagonal = (source: WaterTerrainSnapshot, x: number, z: number) => {
    if (source.surface === "float32-triangles") {
      const { x0, x1, z0, z1 } = float32GridCell({ ...source, spacingZ: source.spacingZ ?? source.spacing }, x, z);
      return (p: LakePointXZ) => (p[0] - x0) / (x1 - x0) - (p[1] - z0) / (z1 - z0);
    }
    const u0 = Math.min(source.columns - 2, Math.floor((x - source.origin[0]) / source.spacing));
    const v0 = Math.min(source.rows - 2, Math.floor((z - source.origin[1]) / (source.spacingZ ?? source.spacing)));
    return (p: LakePointXZ) =>
      (p[0] - source.origin[0]) / source.spacing -
      u0 -
      ((p[1] - source.origin[1]) / (source.spacingZ ?? source.spacing) - v0);
  };
  const cell = (index: number) => {
    const vertices = [index, index + 1, index + grid.width + 1, index + grid.width];
    const corners = vertices.map(point);
    const centerX = (corners[0][0] + corners[2][0]) / 2,
      centerZ = (corners[0][1] + corners[2][1]) / 2;
    const source = sourceAt(centerX, centerZ);
    if (source && hasFixedTriangles(source)) {
      // Intersect each original Terrain triangle, including diagonals crossing a finer raster cell.
      const side = triangleDiagonal(source, centerX, centerZ);
      for (const sign of [-1, 1]) {
        const polygon: LakePointXZ[] = [];
        for (let i = 0; i < corners.length; i++) {
          const a = corners[i],
            b = corners[(i + 1) % corners.length];
          const da = side(a) * sign,
            db = side(b) * sign;
          if (da >= 0) polygon.push(a);
          if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
            const t = da / (da - db);
            polygon.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
          }
        }
        const hits: string[] = [];
        for (let i = 0; i < polygon.length; i++) {
          const a = polygon[i],
            b = polygon[(i + 1) % polygon.length];
          const ha = sampleSource(source, a),
            hb = sampleSource(source, b);
          if (ha < waterLevel !== hb < waterLevel) hits.push(crossing(a, b, ha, hb));
        }
        if (hits.length === 2) link(hits[0], hits[1]);
      }
      return;
    }
    const values = source ? corners.map((p) => sampleSource(source, p)) : vertices.map((v) => heights[v]);
    const h = values.map((value) => value - waterLevel);
    const hits = corners.flatMap((p, edge) => {
      const next = (edge + 1) % 4;
      return values[edge] < waterLevel !== values[next] < waterLevel
        ? [crossing(p, corners[next], values[edge], values[next])]
        : [];
    });
    if (!hits.length) return;
    const A = h[0],
      B = h[1] - h[0],
      C = h[3] - h[0],
      D = h[2] - h[1] - h[3] + h[0];
    let pairs: string[][];
    if (hits.length === 2) pairs = [hits];
    else {
      const determinant = A * D - B * C;
      if (Math.abs(determinant) <= Number.EPSILON * Math.max(1, Math.abs(A * D), Math.abs(B * C)))
        throw new Error("Lake shoreline touches itself at a bilinear saddle; adjust the water level.");
      const saddleWet = determinant / D < 0;
      pairs =
        h[0] < 0 === saddleWet
          ? [
              [hits[0], hits[1]],
              [hits[2], hits[3]]
            ]
          : [
              [hits[0], hits[3]],
              [hits[1], hits[2]]
            ];
    }
    const [ox, oz] = point(index),
      [sx, sz] = grid.cellSizeXZ;
    for (const [start, end] of pairs) {
      if (start === end) continue;
      const p = points.get(start)!,
        q = points.get(end)!;
      // A branch is a monotone rational function of X or Z. Pick the longer span.
      const alongX = Math.abs((q[0] - p[0]) / sx) >= Math.abs((q[1] - p[1]) / sz);
      const coordinate = (p: LakePointXZ) => (alongX ? (p[0] - ox) / sx : (p[1] - oz) / sz);
      const linear = alongX ? B : C,
        denominatorBase = alongX ? C : B;
      const otherSpacing = alongX ? sz : sx;
      const refine = (from: string, to: string, depth: number) => {
        const a = points.get(from)!,
          b = points.get(to)!;
        const t0 = coordinate(a),
          t1 = coordinate(b);
        const d0 = denominatorBase + D * t0,
          d1 = denominatorBase + D * t1;
        const minimumDenominator = Math.min(Math.abs(d0), Math.abs(d1));
        // |f''| * span^2 / 8 bounds deviation from the chord over the entire interval.
        const numerator = 2 * D * (linear * denominatorBase - D * A);
        const bound =
          numerator === 0 ? 0 : (Math.abs(numerator) * (t1 - t0) ** 2 * otherSpacing) / (8 * minimumDenominator ** 3);
        if (Number.isFinite(bound) && bound <= tolerance) {
          link(from, to);
          return;
        }
        if (depth >= 24) throw new Error("Lake bilinear shoreline cannot satisfy chord tolerance.");
        const t = (t0 + t1) / 2;
        const other = -(A + linear * t) / (denominatorBase + D * t);
        if (++contourPointCount > 8192) throw new Error("Lake bilinear shoreline exceeds 8192 points.");
        const middle = `c${index}:${contourPointCount}`;
        points.set(middle, alongX ? [ox + t * sx, oz + other * sz] : [ox + other * sx, oz + t * sz]);
        refine(from, middle, depth + 1);
        refine(middle, to, depth + 1);
      };
      refine(start, end, 0);
    }
  };
  for (let z = 0; z < grid.height; z++) {
    for (let x = 0; x < grid.width; x++) {
      const a = z * grid.width + x;
      if (
        !includesContourPoint &&
        (x === 0 || z === 0 || x === grid.width - 1 || z === grid.height - 1) &&
        heights[a] < waterLevel
      )
        throw new Error("Lake water reaches the terrain edge; enlarge the terrain or lower the water level.");
      if (x < grid.width - 1 && z < grid.height - 1) cell(a);
    }
  }
  if (terrain.bedTerrain) {
    // A legal replacement grid may have a discontinuous edge. Its vertical face contributes
    // shore exactly where the two owning cells disagree on wetness; it must not open a contour.
    const seam = (a: LakePointXZ, b: LakePointXZ, left: WaterTerrainSnapshot, right: WaterTerrainSnapshot) => {
      if (left === right) return;
      const at = (t: number): LakePointXZ => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const breaks = [0, 1];
      for (const source of [left, right])
        if (hasFixedTriangles(source)) {
          const diagonal = triangleDiagonal(source, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
          const da = diagonal(a),
            db = diagonal(b),
            t = da / (da - db);
          if (t > 0 && t < 1) breaks.push(t);
        }
      breaks.sort((a, b) => a - b);
      const spans = [...breaks];
      for (let i = 1; i < breaks.length; i++)
        for (const source of [left, right]) {
          const lo = breaks[i - 1],
            hi = breaks[i];
          const ha = sampleSource(source, at(lo)),
            hb = sampleSource(source, at(hi));
          if (ha < waterLevel !== hb < waterLevel) spans.push(lo + ((hi - lo) * (waterLevel - ha)) / (hb - ha));
        }
      spans.sort((a, b) => a - b);
      for (let i = 1; i < spans.length; i++) {
        const lo = spans[i - 1],
          hi = spans[i];
        if ((hi - lo) * Math.hypot(b[0] - a[0], b[1] - a[1]) < LAKE_BOUNDARY_EPSILON) continue;
        const p = at((lo + hi) / 2);
        if (sampleSource(left, p) < waterLevel !== sampleSource(right, p) < waterLevel)
          link(remember(at(lo)), remember(at(hi)));
      }
    };
    const [sx, sz] = grid.cellSizeXZ;
    for (const patch of terrain.bedTerrain.refinements ?? []) {
      const x0 = Math.round((patch.origin[0] - grid.originXZ[0]) / sx);
      const z0 = Math.round((patch.origin[1] - grid.originXZ[1]) / sz);
      const x1 = Math.round((patch.origin[0] + (patch.columns - 1) * patch.spacing - grid.originXZ[0]) / sx);
      const z1 = Math.round(
        (patch.origin[1] + (patch.rows - 1) * (patch.spacingZ ?? patch.spacing) - grid.originXZ[1]) / sz
      );
      for (const x of [x0, x1])
        if (x > 0 && x < grid.width - 1)
          for (let z = Math.max(0, z0); z < Math.min(grid.height - 1, z1); z++) {
            const a = point(z * grid.width + x),
              b = point((z + 1) * grid.width + x);
            seam(a, b, sourceAt(a[0] - sx / 2, a[1] + sz / 2)!, sourceAt(a[0] + sx / 2, a[1] + sz / 2)!);
          }
      for (const z of [z0, z1])
        if (z > 0 && z < grid.height - 1)
          for (let x = Math.max(0, x0); x < Math.min(grid.width - 1, x1); x++) {
            const a = point(z * grid.width + x),
              b = point(z * grid.width + x + 1);
            seam(a, b, sourceAt(a[0] + sx / 2, a[1] - sz / 2)!, sourceAt(a[0] + sx / 2, a[1] + sz / 2)!);
          }
    }
  }
  if (includesContourPoint) {
    const inspected = new Set<string>();
    for (const start of links.keys()) {
      if (inspected.has(start)) continue;
      const component = [start];
      inspected.add(start);
      let relevant = false;
      for (let i = 0; i < component.length; i++) {
        const key = component[i],
          p = points.get(key)!;
        relevant ||= includesContourPoint(p[0], p[1]);
        for (const next of links.get(key)!)
          if (!inspected.has(next)) {
            inspected.add(next);
            component.push(next);
          }
      }
      if (!relevant) for (const key of component) links.delete(key);
    }
  }
  if (!links.size) throw new Error("Lake water level leaves no wet basin.");
  const [cellX, cellZ] = grid.cellSizeXZ,
    onBorder = (p: LakePointXZ) =>
      p[0] <= grid.originXZ[0] + LAKE_BOUNDARY_EPSILON ||
      p[0] >= grid.originXZ[0] + (grid.width - 1) * cellX - LAKE_BOUNDARY_EPSILON ||
      p[1] <= grid.originXZ[1] + LAKE_BOUNDARY_EPSILON ||
      p[1] >= grid.originXZ[1] + (grid.height - 1) * cellZ - LAKE_BOUNDARY_EPSILON;
  for (const [key, adjacent] of links) {
    if (adjacent.size === 2) continue;
    const p = points.get(key)!;
    // A scoped contour that opens on the capture border is a real spill, not a topology defect.
    if (includesContourPoint && onBorder(p))
      throw new Error("Lake water reaches the terrain edge; enlarge the terrain or lower the water level.");
    throw new Error(
      `Lake shoreline is open or touches itself at (${p[0]}, ${p[1]}); found ${adjacent.size} incident segments.`
    );
  }
  const visited = new Set<string>();
  const rings: LakePointXZ[][] = [];
  for (const start of links.keys()) {
    if (visited.has(start)) continue;
    const ring: LakePointXZ[] = [];
    let previous = "",
      current = start;
    do {
      if (visited.has(current)) throw new Error("Lake shoreline is not a closed ring.");
      visited.add(current);
      ring.push(points.get(current)!);
      const next = [...links.get(current)!].find((key) => key !== previous)!;
      previous = current;
      current = next;
    } while (current !== start);
    // Planar cells often introduce collinear points; remove them without moving the contour.
    const simplified = ring.filter((p, i) => {
      const a = ring[(i + ring.length - 1) % ring.length],
        b = ring[(i + 1) % ring.length];
      return Math.abs((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) > 1e-10;
    });
    if (simplified.length < 3) throw new Error("Lake shoreline has zero area.");
    rings.push(simplified);
  }
  return {
    schemaVersion: 1,
    waterLevel,
    rings: rings.map((ring) => ring.map((position) => ({ position }))),
    maxChordError: tolerance,
    terrainShorelineTolerance: tolerance,
    maxSegmentLength: 2,
    queryCoverage: "boundary"
  };
}
