import profile from "../planning-data/settlement-profile.json";
import type { IslandPlan, PlanPoint } from "./IslandPlanModel";
import { ribbonOutline } from "./WorldRibbon";
import { PLANNING_SURFACES } from "./PlanningSurfacePalette";
import { PLANNING_RIVER_BED_BANK_EXTENSION_METRES } from "../spatial/runtime/PlanningRiverBedLayer";
import { surfaceTransitionWeight } from "@galacean/engine-terrain/geometry/surfaceTransitionWeight";
export { PLANNING_SURFACES } from "./PlanningSurfacePalette";
/** Vertex-centred, row-major RGBA bytes. Origin (0,0); rows increase along world +Z. */
export interface PlanningAlphamap {
  resolution: number;
  width: number;
  depth: number;
  weights: Uint8Array;
  coverage: Uint8Array;
  sdf: Uint8Array;
  /** Separate Terrain material coverage; lakes/ocean retain their current bed. */
  riverBedCoverage?: Uint8Array;
}
const cache = new WeakMap<IslandPlan, PlanningAlphamap>();
// Keep only two surface revisions. Worker snapshots may be cloned, but rock edits do not change these inputs.
const surfaces = new Map<string, PlanningAlphamap>();
const snapshotKeys = new WeakMap<IslandPlan, string>();
function retain(key: string, map: PlanningAlphamap): void {
  surfaces.delete(key);
  surfaces.set(key, map);
  if (surfaces.size > 2) surfaces.delete(surfaces.keys().next().value!);
}
/** Rasterize semantic areas once per snapshot; never alter height or geometry. Water wins over roads, then soil, then grass. */
export function planningAlphamap(plan: IslandPlan): PlanningAlphamap {
  const saved = cache.get(plan);
  if (saved) {
    retain(snapshotKeys.get(plan)!, saved);
    return saved;
  }
  const key = surfaceKey(plan);
  snapshotKeys.set(plan, key);
  const shared = surfaces.get(key);
  if (shared) {
    cache.set(plan, shared);
    return shared;
  }
  // Narrow-band analytic polygon SDF, in metres. No oversized intermediate texture.
  const resolution = profile.world.alphamapResolution,
    intervals = resolution - 1,
    { width, depth } = plan.parameters,
    size = resolution * resolution,
    range = 16;
  const soil = new Float32Array(size).fill(range),
    water = new Float32Array(size).fill(range),
    river = new Float32Array(size).fill(range),
    landField = new Float32Array(size).fill(range);
  // A polygon only needs one row of intermediate distances. Keep Float32 rounding
  // before composition, just as in the published full-field raster contract.
  const scanline = new Float32Array(resolution),
    worldX = Float64Array.from({ length: resolution }, (_, col) => (col * width) / intervals);
  const paint = (ring: PlanPoint[], target: Float32Array, subtract = false, also?: Float32Array) => {
    if (ring.length < 3) return;
    // A closed ribbon bridges its inner/outer rings twice; that bridge is not a physical boundary.
    const edgeKey = (a: PlanPoint, b: PlanPoint) => `${a.x},${a.z}:${b.x},${b.z}`;
    const directed = new Set(ring.map((a, i) => edgeKey(a, ring[(i + 1) % ring.length])));
    const edges = ring
      .map((a, i) => {
        const b = ring[(i + 1) % ring.length],
          dx = b.x - a.x,
          dz = b.z - a.z;
        const minX = Math.min(a.x, b.x),
          maxX = Math.max(a.x, b.x),
          minZ = Math.min(a.z, b.z),
          maxZ = Math.max(a.z, b.z);
        return {
          a,
          b,
          dx,
          dz,
          l2: dx * dx + dz * dz,
          minX,
          maxX,
          minZ,
          maxZ,
          boundary: !directed.has(edgeKey(b, a)),
          firstRow: Math.max(0, Math.floor(((minZ - range) / depth) * intervals)),
          lastRow: Math.min(resolution - 1, Math.ceil(((maxZ + range) / depth) * intervals)),
          firstCol: Math.max(0, Math.floor(((minX - range) / width) * intervals)),
          lastCol: Math.min(resolution - 1, Math.ceil(((maxX + range) / width) * intervals))
        };
      })
      .sort((a, b) => a.firstRow - b.firstRow);
    const active: typeof edges = [],
      xs: number[] = [];
    const lastRow = Math.max(...edges.map((edge) => edge.lastRow));
    let cursor = 0;
    for (let row = edges[0].firstRow; row <= lastRow; row++) {
      const z = (row * depth) / intervals;
      while (cursor < edges.length && edges[cursor].firstRow <= row) active.push(edges[cursor++]);
      let count = 0,
        firstCol = resolution,
        lastCol = -1;
      xs.length = 0;
      for (const edge of active) {
        if (edge.lastRow < row) continue;
        active[count++] = edge;
        const { a, b } = edge;
        if (a.z > z !== b.z > z) xs.push(a.x + ((z - a.z) * (b.x - a.x)) / (b.z - a.z));
        if (edge.boundary) {
          firstCol = Math.min(firstCol, edge.firstCol);
          lastCol = Math.max(lastCol, edge.lastCol);
        }
      }
      active.length = count;
      xs.sort((a, b) => a - b);
      // Interior fill can extend beyond the active boundary band, including a
      // polygon whose edges all lie outside the texture.
      if (xs.length > 1) {
        firstCol = Math.min(firstCol, Math.max(0, Math.ceil((xs[0] / width) * intervals)));
        lastCol = Math.max(lastCol, Math.min(resolution - 1, Math.floor((xs.at(-1)! / width) * intervals)));
      }
      if (firstCol > lastCol) continue;
      scanline.fill(range, firstCol, lastCol + 1);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const start = Math.max(0, Math.ceil((xs[k] / width) * intervals)),
          end = Math.min(resolution - 1, Math.floor((xs[k + 1] / width) * intervals));
        if (start <= end) scanline.fill(-range, start, end + 1);
      }
      for (const edge of active) {
        if (!edge.boundary) continue;
        const { a, dx, dz, l2 } = edge,
          zGap = Math.max(0, edge.minZ - z, z - edge.maxZ);
        for (let col = edge.firstCol; col <= edge.lastCol; col++) {
          const x = worldX[col],
            limit = Math.abs(scanline[col]);
          // A box-axis distance is a conservative lower bound. Only discard an
          // edge that cannot improve the exact distance already held by this pixel.
          if (zGap >= limit || edge.minX - x >= limit || x - edge.maxX >= limit) continue;
          const t = l2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2)) : 0,
            d = Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
          if (d < limit) scanline[col] = (scanline[col] < 0 ? -1 : 1) * d;
        }
      }
      const offset = row * resolution;
      for (let col = firstCol; col <= lastCol; col++) {
        const index = offset + col,
          distance = scanline[col];
        target[index] = subtract ? Math.max(target[index], -distance) : Math.min(target[index], distance);
        if (also) also[index] = Math.min(also[index], distance);
      }
    }
  };
  for (const ring of [plan.land, ...plan.islands]) paint(ring, landField);
  const band = plan.slopes.length ? new Float32Array(size) : undefined;
  for (const slope of plan.slopes) {
    band!.fill(range);
    paint(slope.outer, band!);
    paint(slope.inner, band!, true);
    for (let i = 0; i < size; i++) soil[i] = Math.min(soil[i], band![i]);
  }
  if (plan.settlementLayout) {
    for (const plaza of plan.plazas ?? []) paint(plaza.outline, soil);
  } else for (const r of plan.regions) if (r.kind === "village") paint(r.navigationArea ?? r.outline, soil);
  for (const c of plan.courtyards ?? []) paint(c.outline, soil, true);
  for (const c of plan.courtyards ?? []) paint(c.path.outline ?? ribbonOutline(c.path.points, [c.path.width]), soil);
  for (const r of plan.routes) paint(r.outline ?? ribbonOutline(r.points, [r.width]), soil);
  for (const w of plan.waters) paint(w.outline, water, false, w.kind === "river" ? river : undefined);
  const weights = new Uint8Array(size * 4),
    riverBedCoverage = new Uint8Array(size),
    coverage = new Uint8Array(size),
    sdf = new Uint8Array(size * 4);
  const blend = (d: number) => surfaceTransitionWeight(d, -1, 1);
  for (let i = 0; i < size; i++) {
    sdf[i * 4] = Math.round(((soil[i] / range) * 0.5 + 0.5) * 255);
    sdf[i * 4 + 1] = Math.round(((water[i] / range) * 0.5 + 0.5) * 255);
    sdf[i * 4 + 3] = 255;
    coverage[i] = Math.round(blend(landField[i]) * 255);
    if (!coverage[i]) continue;
    riverBedCoverage[i] = Math.round(blend(river[i] - PLANNING_RIVER_BED_BANK_EXTENSION_METRES) * 255);
    const w = blend(((sdf[i * 4 + 1] / 255) * 2 - 1) * range),
      d = blend(((sdf[i * 4] / 255) * 2 - 1) * range) * (1 - w);
    weights[i * 4 + 2] = Math.round(w * 255);
    weights[i * 4 + 1] = Math.min(255 - weights[i * 4 + 2], Math.round(d * 255));
    weights[i * 4] = 255 - weights[i * 4 + 1] - weights[i * 4 + 2];
  }
  const result = { resolution, width, depth, weights, coverage, sdf, riverBedCoverage };
  cache.set(plan, result);
  retain(key, result);
  return result;
}
/** Preview colors derive exclusively from RGBA weights. Hidden channels remain neutral, not reclassified. */
export function planningSurfacePixels(map: PlanningAlphamap, layers: Record<string, boolean> = {}): Uint8Array {
  const pixels = new Uint8Array(map.weights.length);
  for (let i = 0; i < map.coverage.length; i++) {
    for (let c = 0; c < PLANNING_SURFACES.length; c++) {
      const weight = map.weights[i * 4 + c] / 255,
        palette = layers["surface-" + PLANNING_SURFACES[c].id] === false ? [185, 185, 185] : PLANNING_SURFACES[c].color;
      for (let j = 0; j < 3; j++) pixels[i * 4 + j] += Math.round(weight * palette[j]);
    }
    pixels[i * 4 + 3] = map.coverage[i];
  }
  return pixels;
}

function surfaceKey(plan: IslandPlan): string {
  return JSON.stringify([
    profile.world.alphamapResolution,
    plan.parameters.width,
    plan.parameters.depth,
    plan.land,
    plan.islands,
    plan.slopes.map((s) => [s.outer, s.inner]),
    plan.settlementLayout
      ? plan.plazas?.map((p) => p.outline)
      : plan.regions.filter((r) => r.kind === "village").map((r) => r.navigationArea ?? r.outline),
    plan.routes.map((r) => r.outline ?? ribbonOutline(r.points, [r.width])),
    plan.waters.map((w) => [w.kind, w.outline]),
    plan.courtyards?.map((c) => [c.outline, c.path.outline])
  ]);
}

/** Adopt immutable worker raster data without repainting polygons on the UI thread. */
export function adoptPlanningAlphamap(plan: IslandPlan, data: PlanningAlphamap): PlanningAlphamap {
  const key = surfaceKey(plan),
    map = surfaces.get(key) ?? data;
  cache.set(plan, map);
  snapshotKeys.set(plan, key);
  retain(key, map);
  return map;
}
