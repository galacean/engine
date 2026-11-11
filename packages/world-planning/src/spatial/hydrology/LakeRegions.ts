import { planningCandidateCount, type PlanningCountRange } from "../PlanningCountRange";
import { sampleLakeBoundary } from "@galacean/engine-water/water/compiler/index";
import { generateRiverRegions, RIVER_DEFAULTS } from "./RiverRegions";
import type { IslandPlan, PlanPoint } from "../../semantic-study/IslandPlanModel";
import type { PlanningCheck } from "../../semantic-study/WorldPlanningContract";
import { createPlanningGroundSampler, createPlanningRingQuery } from "../../semantic-study/WorldPlanningTerrain";
import { settlementRandom } from "../../semantic-study/SettlementGeometry";

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

/** Deterministic initial sites are chosen before per-lake edits, so editing one does not reroll its neighbours. */
export function generateLakeRegions(
  plan: IslandPlan,
  config: LakeParameters,
  local: Record<string, Partial<LakeParameters>>
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
        local[id].enabled !== false &&
        (id.startsWith("lake:authored:") || local[id].shoreline !== undefined)
    )
    .sort();
  if (!candidateCount && !manualIds.length) return [];
  // Site identity depends on base Terrain and the seeded initial corridors, never current river edits.
  const sitePlan: IslandPlan = { ...plan, waters: [], planning: { ...plan.planning!, profiles: [] } };
  const ground = createPlanningGroundSampler(sitePlan, { natural: true });
  if (candidateCount) generateRiverRegions(sitePlan, RIVER_DEFAULTS, {});
  const initialWaters = sitePlan.waters.map((w) => createPlanningRingQuery(w.outline));
  const lands = [plan.land, ...plan.islands].map((outline) => createPlanningRingQuery(outline));
  const waters = plan.waters.map((w) => createPlanningRingQuery(w.outline));
  const candidates: Array<{ center: PlanPoint; level: number; score: number }> = [];
  const margin = config.radiusM * 1.15 + config.bankWidthM;
  const step = Math.max(16, config.radiusM);
  const phase = settlementRandom(plan.parameters.seed, "lakes:shape") * Math.PI * 2;
  for (let z = margin; candidateCount && z < plan.parameters.depth - margin; z += step) {
    for (let x = margin; x < plan.parameters.width - margin; x += step) {
      const center = { x, z };
      if (!lands.some((land) => land.inside(center) && land.distance(center, margin) >= margin)) continue;
      if (initialWaters.some((water) => water.inside(center) || water.distance(center, margin) < margin)) continue;
      const shore = circle(center, config.radiusM, phase);
      const heights = shore.map(ground);
      // Keep a dry rim above the datum. Equality at the lowest rim creates a flat
      // spill saddle that R16 quantization can connect to neighbouring lowlands.
      // This chooses the initial automatic datum; edits never adjust an explicit datum.
      const level = Math.min(...heights) - 0.1;
      if (level <= 0.1) continue;
      const basin = level - ground(center);
      if (!config.allowCarving && basin < config.depthM) continue;
      candidates.push({
        center,
        level,
        score:
          Math.max(...heights) -
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
    sites.push(candidate);
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
    if (shape.waterLevel > Math.min(...outline.map(ground)) + 1e-6)
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
