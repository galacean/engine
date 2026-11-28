import { planningCandidateCount, type PlanningCountRange } from "../PlanningCountRange";
import { sampleLakeBoundary } from "@galacean/engine-water/water/compiler/index";
import type { IslandPlan, PlanPoint } from "../../semantic-study/IslandPlanModel";
import type { PlanningCheck } from "../../semantic-study/WorldPlanningContract";
import { createPlanningGroundSampler, createPlanningRingQuery } from "../../semantic-study/WorldPlanningTerrain";
import { settlementRandom } from "../../semantic-study/SettlementGeometry";
import profile from "../../planning-data/settlement-profile.json";

export interface LakeParameters extends PlanningCountRange {
  referenceLevel?: number;
  shoreline?: { id: string; ring: string; x: number; z: number }[];
  radiusM: number;
  depthM: number;
  bankWidthM: number;
  allowCarving: boolean;
  offsetX: number;
  offsetZ: number;
  levelOffsetM: number;
  enabled: boolean;
}
export interface PlanningLakeShape {
  readonly holes?: PlanPoint[][];
  readonly center: PlanPoint;
  readonly radiusM: number;
  readonly referenceLevel: number;
  readonly waterLevel: number;
  readonly depthM: number;
  readonly carved: boolean;
}
export const LAKE_DEFAULTS: Readonly<LakeParameters> = Object.freeze({
  countMin: 1,
  countMax: 1,
  radiusM: 25,
  depthM: 4,
  bankWidthM: 4,
  allowCarving: true,
  offsetX: 0,
  offsetZ: 0,
  levelOffsetM: 0,
  enabled: true
});

function circle(center: PlanPoint, radius: number, phase: number): PlanPoint[] {
  return Array.from({ length: 96 }, (_, i) => {
    const a = (i / 96) * Math.PI * 2;
    const r = radius * (1 + 0.08 * Math.sin(a * 3 + phase) + 0.04 * Math.sin(a * 5 - phase));
    return { x: center.x + Math.cos(a) * r, z: center.z + Math.sin(a) * r };
  });
}

function lakeGridMetrics(plan: Pick<IslandPlan, "parameters" | "raster">, external: boolean) {
  if (external) {
    const spacing = plan.raster.spacing > 0 ? plan.raster.spacing : 1;
    return {
      spacingX: spacing,
      spacingZ: spacing,
      cols: Math.max(2, Math.round(plan.parameters.width / spacing) + 1),
      rows: Math.max(2, Math.round(plan.parameters.depth / spacing) + 1)
    };
  }
  const resolution = profile.world.heightmapResolution;
  return {
    spacingX: plan.parameters.width / (resolution - 1),
    spacingZ: plan.parameters.depth / (resolution - 1),
    cols: resolution,
    rows: resolution
  };
}

/** Minimum terrain height along the outer shoreline and its two-cell exterior grid collar.
 * Setting a lake datum strictly below this value guarantees a closed dry grid barrier on
 * canonical float32-triangle heightmaps, preventing capture-border boundary spills.
 */
export function planningLakeCollarMinHeight(
  plan: Pick<IslandPlan, "parameters" | "raster">,
  ring: PlanPoint[],
  ground: (p: PlanPoint) => number,
  options?: { external?: boolean }
): number {
  if (ring.length < 3) return Infinity;
  const external = options?.external ?? false;
  const { spacingX, spacingZ, cols, rows } = lakeGridMetrics(plan, external);
  const inside = createPlanningRingQuery(ring);
  const step = Math.min(0.5, Math.min(spacingX, spacingZ) * 0.5);
  const visited = new Set<number>();
  const probe = { x: 0, z: 0 };
  let minimum = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step));
    for (let j = 0; j < count; j++) {
      const t = j / count;
      const px = a.x + (b.x - a.x) * t;
      const pz = a.z + (b.z - a.z) * t;
      probe.x = px;
      probe.z = pz;
      const rimHeight = ground(probe);
      if (rimHeight < minimum) minimum = rimHeight;
      const gx0 = Math.floor(px / spacingX);
      const gz0 = Math.floor(pz / spacingZ);
      for (let oz = -1; oz <= 2; oz++) {
        const gz = gz0 + oz;
        if (gz < 0 || gz >= rows) continue;
        const wz = external ? Math.min(plan.parameters.depth, gz * spacingZ) : gz * spacingZ;
        for (let ox = -1; ox <= 2; ox++) {
          const gx = gx0 + ox;
          if (gx < 0 || gx >= cols) continue;
          const key = gz * cols + gx;
          if (visited.has(key)) continue;
          visited.add(key);
          probe.x = external ? Math.min(plan.parameters.width, gx * spacingX) : gx * spacingX;
          probe.z = wz;
          if (inside.inside(probe)) continue;
          const collarHeight = ground(probe);
          if (collarHeight < minimum) minimum = collarHeight;
        }
      }
    }
  }
  return minimum;
}

/** Deterministic initial sites are chosen before per-lake edits, so editing one does not reroll its neighbours. */
export function generateLakeRegions(
  plan: IslandPlan,
  config: LakeParameters,
  local: Record<string, Partial<LakeParameters>>,
  reservations: readonly ReturnType<typeof createPlanningRingQuery>[] = [],
  baseGround?: (p: PlanPoint) => number
): PlanningCheck[] {
  const candidateCount = planningCandidateCount(plan.parameters.seed, "lakes:count", config, 1);
  for (const key of ["radiusM", "depthM", "bankWidthM"] as const)
    if (!Number.isFinite(config[key]) || config[key] <= 0) throw new Error(`湖泊 ${key} 必须为正数`);
  plan.waters = plan.waters.filter((w) => w.kind !== "lake");
  plan.planning!.profiles = plan.planning!.profiles.filter((p) => !p.ownerId.startsWith("lake:"));
  const manualIds = Object.keys(local)
    .filter(
      (id) =>
        id.startsWith("lake:") &&
        (local[id].enabled ?? config.enabled) &&
        (id.startsWith("lake:authored:") || local[id].shoreline !== undefined)
    )
    .sort();
  if (!candidateCount && !manualIds.length) return [];
  // Sample terrain after all current rivers and their bank grading are applied, so automatic
  // lakes never pick sites or datums undercut by neighbouring river banks.
  const ground = createPlanningGroundSampler(plan, { natural: true, baseGround });
  const rimHeights = (ring: readonly PlanPoint[]) =>
    // Check between authored vertices too; both river bank grading and external fields can
    // introduce low saddles along an edge. Keep half-metre sampling for site and edit validation.
    ring.flatMap((a, i) => {
      const b = ring[(i + 1) % ring.length];
      const count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5));
      return Array.from({ length: count }, (_, j) =>
        ground({ x: a.x + ((b.x - a.x) * j) / count, z: a.z + ((b.z - a.z) * j) / count })
      );
    });
  const minRimHeight = (ring: readonly PlanPoint[]) => {
    const probe = { x: 0, z: 0 };
    let min = Infinity;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5));
      for (let j = 0; j < count; j++) {
        probe.x = a.x + ((b.x - a.x) * j) / count;
        probe.z = a.z + ((b.z - a.z) * j) / count;
        const h = ground(probe);
        if (h < min) min = h;
      }
    }
    return min;
  };
  const external = Boolean(baseGround);
  const { spacingX, spacingZ } = lakeGridMetrics(plan, external);
  const maxSpacing = Math.max(spacingX, spacingZ);
  const lands = [plan.land, ...plan.islands].map((outline) => createPlanningRingQuery(outline));
  const waters = plan.waters.map((w) => createPlanningRingQuery(w.outline));
  const authoredLakes = manualIds.flatMap((id) => {
    const cfg = { ...config, ...local[id] };
    const shore = cfg.shoreline?.filter((p) => p.ring === "shore");
    if (
      !shore ||
      shore.length < 3 ||
      !Number.isFinite(cfg.offsetX) ||
      !Number.isFinite(cfg.offsetZ) ||
      !shore.every((p) => Number.isFinite(p.x) && Number.isFinite(p.z))
    )
      return [];
    return [
      {
        ring: createPlanningRingQuery(shore.map((p) => ({ x: p.x + cfg.offsetX, z: p.z + cfg.offsetZ }))),
        bankWidthM: Number.isFinite(cfg.bankWidthM) && cfg.bankWidthM > 0 ? cfg.bankWidthM : config.bankWidthM
      }
    ];
  });
  const candidates: Array<{ center: PlanPoint; level: number; score: number }> = [];
  const margin = config.radiusM * 1.15 + Math.max(config.bankWidthM, maxSpacing * 2.5);
  const outerProbeRadius = config.radiusM + maxSpacing * 2;
  const step = Math.max(16, config.radiusM);
  const phase = settlementRandom(plan.parameters.seed, "lakes:shape") * Math.PI * 2;
  for (let z = margin; candidateCount && z < plan.parameters.depth - margin; z += step) {
    for (let x = margin; x < plan.parameters.width - margin; x += step) {
      const center = { x, z };
      if (!lands.some((land) => land.inside(center) && land.distance(center, margin) >= margin)) continue;
      if (reservations.some((area) => area.inside(center) || area.distance(center, margin) < margin)) continue;
      if (waters.some((water) => water.inside(center) || water.distance(center, margin) < margin)) continue;
      if (
        authoredLakes.some(
          (lake) =>
            lake.ring.inside(center) || lake.ring.distance(center, margin + lake.bankWidthM) < margin + lake.bankWidthM
        )
      )
        continue;
      const shore = circle(center, config.radiusM, phase);
      const heights = baseGround ? rimHeights(shore) : shore.map(ground);
      let minHeight = Infinity,
        maxHeight = -Infinity;
      for (let k = 0; k < heights.length; k++) {
        const h = heights[k];
        if (h < minHeight) minHeight = h;
        if (h > maxHeight) maxHeight = h;
      }
      // Probe two grid cells outside the shore during ranking so river banks and downhill
      // slopes outside the rim immediately penalize unstable sites.
      const outer = circle(center, outerProbeRadius, phase);
      for (let k = 0; k < outer.length; k++) {
        const h = ground(outer[k]);
        if (h < minHeight) minHeight = h;
      }
      // Keep a dry rim above the datum. Equality at the lowest rim creates a flat
      // spill saddle that Float32/R16 quantization can connect to neighbouring lowlands.
      // This chooses the initial automatic datum; edits never adjust an explicit datum.
      const level = Math.fround(minHeight - 0.1);
      if (!baseGround && level <= 0.1) continue;
      const basin = level - ground(center);
      if (!config.allowCarving && basin < config.depthM) continue;
      candidates.push({
        center,
        level,
        score:
          maxHeight -
          level -
          Math.min(basin, config.depthM) * 2 +
          level * 0.01 +
          settlementRandom(plan.parameters.seed, `lake:${x}:${z}`) * 0.1
      });
    }
  }
  candidates.sort((a, b) => a.score - b.score || a.center.x - b.center.x || a.center.z - b.center.z);
  const sites: typeof candidates = [];
  for (const candidate of candidates) {
    if (sites.length >= candidateCount) break;
    if (sites.some((s) => Math.hypot(s.center.x - candidate.center.x, s.center.z - candidate.center.z) < margin * 2))
      continue;
    const shore = circle(candidate.center, config.radiusM, phase);
    const exactCollarMin = planningLakeCollarMinHeight(plan, shore, ground, { external });
    const level = Math.fround(exactCollarMin - 0.1);
    if (!baseGround && level <= 0.1) continue;
    if (!config.allowCarving && level - ground(candidate.center) < config.depthM) continue;
    sites.push({ ...candidate, level });
  }
  const naturalCount = sites.length;
  for (const id of manualIds) {
    const cfg = local[id],
      points = cfg.shoreline?.filter((p) => p.ring === "shore");
    if (!points?.length || !Number.isFinite(cfg.referenceLevel))
      throw new Error("INVALID_ARGUMENT: 自定义湖泊缺少岸线或参考高程");
    sites.push({
      center: {
        x: points.reduce((s, p) => s + p.x, 0) / points.length,
        z: points.reduce((s, p) => s + p.z, 0) / points.length
      },
      level: cfg.referenceLevel!,
      score: 0
    });
  }
  for (let i = 0; i < sites.length; i++) {
    const id = i < naturalCount ? `lake:${i}` : manualIds[i - naturalCount],
      cfg = { ...config, ...local[id] };
    if (i < naturalCount && manualIds.includes(id)) continue;
    if (!cfg.enabled) continue;
    const center = { x: sites[i].center.x + cfg.offsetX, z: sites[i].center.z + cfg.offsetZ };
    if (
      ![center.x, center.z, cfg.radiusM, cfg.depthM, cfg.bankWidthM, cfg.levelOffsetM].every(Number.isFinite) ||
      cfg.radiusM <= 0 ||
      cfg.depthM <= 0 ||
      cfg.bankWidthM <= 0
    )
      throw new Error("湖泊参数无效");
    let outline = circle(center, cfg.radiusM, phase);
    const holes: PlanPoint[][] = [];
    if (cfg.shoreline !== undefined) {
      const rings = new Map<string, PlanPoint[]>(),
        ids = new Set<string>();
      for (const point of cfg.shoreline) {
        if (!point.id || ids.has(point.id) || !point.ring || ![point.x, point.z].every(Number.isFinite))
          throw new Error("INVALID_ARGUMENT: 湖岸控制点或 ID 无效");
        ids.add(point.id);
        const ring = rings.get(point.ring) ?? [];
        ring.push({ x: point.x + cfg.offsetX, z: point.z + cfg.offsetZ });
        rings.set(point.ring, ring);
      }
      if (!rings.has("shore") || [...rings.values()].some((ring) => ring.length < 3))
        throw new Error("INVALID_ARGUMENT: shore 与每个岛洞至少需要三个点");
      outline = rings.get("shore")!;
      for (const [id, ring] of rings) if (id !== "shore") holes.push(ring);
      const outer = createPlanningRingQuery(outline);
      for (const [i, hole] of holes.entries()) {
        if (
          !outer.containsPolygon(hole) ||
          holes.slice(0, i).some((other) => createPlanningRingQuery(other).overlapsPolygon(hole))
        )
          throw new Error("INVALID_ARGUMENT: 岛洞必须位于湖岸内且不能相交");
      }
    }
    sampleLakeBoundary({
      schemaVersion: 1,
      waterLevel: sites[i].level,
      rings: [outline, ...holes].map((ring) => ring.map((p) => ({ position: [p.x, p.z] as const }))),
      maxChordError: 0.025,
      maxSegmentLength: 10000,
      queryCoverage: "boundary"
    });
    if (!lands.some((land) => land.containsPolygon(outline))) throw new Error(`湖泊 ${id} 超出陆域`);
    if (waters.some((water) => water.overlapsPolygon(outline)))
      throw new Error(`湖泊 ${id} 与现有水体相交；M1 不隐式建立连接`);
    // Basin edits retain the initial reference datum. A wider outline may expose a lower
    // rim: reject overflow instead of silently changing the lake's authored water level.
    const referenceLevel = cfg.referenceLevel ?? sites[i].level;
    const shape: PlanningLakeShape = {
      center,
      holes,
      radiusM: cfg.radiusM,
      referenceLevel,
      waterLevel: referenceLevel + cfg.levelOffsetM,
      depthM: cfg.depthM,
      carved: cfg.allowCarving
    };
    if (shape.waterLevel > referenceLevel + 1e-6) throw new Error("M1 不支持超出湖岸的漫岸演算");
    if (shape.waterLevel > minRimHeight(outline) + 1e-6)
      throw new Error(`湖泊 ${id} 的修改使水位高于岸顶；请显式降低水位`);
    for (const hole of holes) {
      const query = createPlanningRingQuery(hole),
        xs = hole.map((p) => p.x),
        zs = hole.map((p) => p.z);
      const dx = Math.max(0.5, (Math.max(...xs) - Math.min(...xs)) / 128),
        dz = Math.max(0.5, (Math.max(...zs) - Math.min(...zs)) / 128);
      for (let z = Math.min(...zs); z <= Math.max(...zs); z += dz)
        for (let x = Math.min(...xs); x <= Math.max(...xs); x += dx)
          if (query.inside({ x, z }) && ground({ x, z }) < shape.waterLevel - 1e-4)
            throw new Error(`TERRAIN_CHANGE_REQUIRED: 湖泊 ${id} 的岛洞低于水位；M1 不隐式填土造岛`);
    }
    if (!shape.carved || shape.waterLevel <= referenceLevel - cfg.depthM) {
      const ring = createPlanningRingQuery(outline),
        islands = holes.map(createPlanningRingQuery),
        xs = outline.map((p) => p.x),
        zs = outline.map((p) => p.z);
      const dx = Math.max(0.05, (Math.max(...xs) - Math.min(...xs)) / 128),
        dz = Math.max(0.05, (Math.max(...zs) - Math.min(...zs)) / 128);
      let wet = false;
      for (let z = Math.min(...zs); !wet && z <= Math.max(...zs); z += dz)
        for (let x = Math.min(...xs); !wet && x <= Math.max(...xs); x += dx)
          wet =
            ring.inside({ x, z }) && !islands.some((h) => h.inside({ x, z })) && ground({ x, z }) < shape.waterLevel;
      if (!wet) throw new Error(`EMPTY_WATER: 湖泊 ${id} 在当前水位没有实际水域；请调整水位或显式雕刻湖盆`);
    }
    plan.waters.push({ id, label: `湖泊 ${i + 1}`, kind: "lake", outline, lake: shape, bankWidthM: cfg.bankWidthM });
    waters.push(createPlanningRingQuery(outline));
    plan.planning!.profiles.push(
      {
        id: `${id}:surface`,
        ownerId: id,
        kind: "water",
        points: [{ ...center, y: shape.waterLevel }],
        width: cfg.radiusM * 2,
        supportIds: []
      },
      {
        id: `${id}:bed`,
        ownerId: id,
        kind: "bed",
        points: [{ ...center, y: referenceLevel - cfg.depthM }],
        width: cfg.radiusM * 2,
        supportIds: []
      }
    );
  }
  return naturalCount < candidateCount
    ? [
        {
          id: "lake:count",
          owners: ["world"],
          rule: "lake-generation",
          required: false,
          status: "unknown",
          message: `请求 ${candidateCount} 个湖泊，找到 ${naturalCount} 个候选位置；保留请求数量`,
          measured: naturalCount,
          limit: candidateCount
        }
      ]
    : [];
}
