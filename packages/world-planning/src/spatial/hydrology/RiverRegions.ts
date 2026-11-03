import {
  watercourseGeometry,
  resolveWatercourse,
  type WatercoursePoint,
  type WatercourseSection
} from "@galacean/engine-water/water/index";
import type { IslandPlan, PlanPoint, PlanWater } from "../../semantic-study/IslandPlanModel";
import type { PlanningCheck } from "../../semantic-study/WorldPlanningContract";
import { createPlanningGroundSampler, createPlanningRingQuery } from "../../semantic-study/WorldPlanningTerrain";
import { settlementRandom } from "../../semantic-study/SettlementGeometry";
import { ribbonOutline } from "../../semantic-study/WorldRibbon";
import { territoryLookup } from "../ecology/PoiTerritories";

/** World hydrology preferences. All lengths and levels are metres. Each river publishes its own longitudinal profile. */
export interface RiverParameters {
  points?: WatercoursePoint[];
  sections?: WatercourseSection[];
  enabled?: boolean;
  count: number;
  lengthM: number;
  automaticLevel: boolean;
  waterY: number;
  widthMinM: number;
  widthMaxM: number;
  bendM: number;
  bendScaleM: number;
  depthMinM: number;
  depthMaxM: number;
  bankWidthM: number;
  preference: number;
}
export const RIVER_DEFAULTS: RiverParameters = {
  count: 1,
  lengthM: 1000,
  automaticLevel: true,
  waterY: 3,
  widthMinM: 10,
  widthMaxM: 18,
  bendM: 24,
  bendScaleM: 160,
  depthMinM: 0.35,
  depthMaxM: 0.85,
  bankWidthM: 12,
  preference: 1
};
const distance = (a: PlanPoint, b: PlanPoint) => Math.hypot(a.x - b.x, a.z - b.z);
/** Quadratic B-spline subdivision retains ends and removes grid corners without overshoot. */
function smoothPath(input: PlanPoint[]): PlanPoint[] {
  let points = input;
  for (let pass = 0; pass < 3; pass++) {
    const next = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
      next.push(
        { x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 },
        { x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 }
      );
    }
    next.push(points.at(-1)!);
    points = next;
  }
  const result = [points[0]];
  for (const p of points.slice(1, -1)) if (distance(p, result.at(-1)!) >= 3) result.push(p);
  result.push(points.at(-1)!);
  return result;
}

/** Generate bounded lowland corridors before volumes. Water has no POI identity; local rules
 * are sampled through management-cell ownership. The DAG search visits each candidate once.
 * @returns Soft diagnostics for requested rivers that have no feasible planar corridor.
 */
export function generateRiverRegions(
  plan: IslandPlan,
  config: RiverParameters,
  local: Record<string, Partial<RiverParameters>>
): PlanningCheck[] {
  // This stage rebuilds the complete water set. Retire profiles by the actual
  // previous owner identities, including authored basins/rivers with custom IDs.
  // A prefix-only reset leaves stale profiles that would precede their new copy.
  const previousWaterIds = new Set(plan.waters.map((water) => water.id));
  plan.waters = [];
  plan.bridges = [];
  plan.roadApproaches = []; // Derived road grading must never feed back into hydrology.
  plan.planning!.profiles = plan.planning!.profiles.filter((p) => !previousWaterIds.has(p.ownerId));
  const ground = createPlanningGroundSampler(plan),
    owner = territoryLookup(plan),
    checks: PlanningCheck[] = [];
  const rules = (p: PlanPoint, base = config): RiverParameters => {
    const weights = owner(p, 24);
    const result = { ...base };
    for (const key of [
      "widthMinM",
      "widthMaxM",
      "bendM",
      "bendScaleM",
      "depthMinM",
      "depthMaxM",
      "bankWidthM",
      "preference"
    ] as const)
      if (weights.length)
        result[key] = weights.reduce((sum, n) => sum + n.weight * (local[n.site.id]?.[key] ?? base[key]), 0);
    return result;
  };
  const staged: { water: PlanWater; depths: number[]; banks: number[]; ceiling: number; levels?: number[] }[] = [];
  const extent = (outline: PlanPoint[]) =>
    Math.max(
      Math.max(...outline.map((p) => p.x)) - Math.min(...outline.map((p) => p.x)),
      Math.max(...outline.map((p) => p.z)) - Math.min(...outline.map((p) => p.z))
    );
  const domains = (plan.poiDistribution?.domains ?? [{ id: "land-main", outline: plan.land }])
    .slice()
    .sort((a, b) => extent(b.outline) - extent(a.outline) || a.id.localeCompare(b.id));
  const requested = [
    ...Array.from({ length: config.count }, (_, i) => `river:${i}`),
    ...Object.keys(local)
      .filter((id) => id.startsWith("river:authored:"))
      .sort()
  ];
  for (const [river, id] of requested.entries()) {
    const riverConfig = { ...config, ...local[id] };
    if (id.startsWith("river:authored:") && !riverConfig.points)
      throw new Error("INVALID_ARGUMENT: 自定义河流缺少控制点");
    if (riverConfig.enabled === false) continue;
    if (riverConfig.points !== undefined) {
      const course = resolveWatercourse({ id, points: riverConfig.points, sections: riverConfig.sections }, (x, z) =>
        ground({ x, z })
      );
      const derived = watercourseGeometry(course);
      const points = derived.points.map((p) => ({ x: p.x, z: p.z })),
        widths = derived.points.map((p) => p.width);
      const outline = ribbonOutline(points, widths, undefined, true);
      if (!domains.some((domain) => createPlanningRingQuery(domain.outline).containsPolygon(outline)))
        throw new Error("INVALID_ARGUMENT: Authored river must stay inside a land domain.");
      const banks = points.map(() => riverConfig.bankWidthM);
      staged.push({
        water: {
          id,
          label: `河流 ${river + 1}`,
          kind: "river",
          outline,
          centerline: points,
          widths,
          bankWidthM: riverConfig.bankWidthM,
          bankWidths: banks,
          authorPoints: riverConfig.points,
          course
        },
        depths: derived.points.map((p) => p.depth),
        banks,
        levels: derived.points.map((p) => p.elevation),
        ceiling: Infinity
      });
      continue;
    }
    // Try every land domain; failure on a small island must not consume a river request.
    for (let attempt = 0; attempt < domains.length; attempt++) {
      const domain = domains[attempt],
        land = createPlanningRingQuery(domain.outline);
      const xs = domain.outline.map((p) => p.x),
        zs = domain.outline.map((p) => p.z);
      const x0 = Math.min(...xs),
        x1 = Math.max(...xs),
        z0 = Math.min(...zs),
        z1 = Math.max(...zs);
      const vertical = z1 - z0 >= x1 - x0;
      const low = vertical ? z0 : x0,
        high = vertical ? z1 : x1,
        sideLow = vertical ? x0 : z0,
        sideHigh = vertical ? x1 : z1;
      const spanRatio = Math.min(0.85, (0.65 * riverConfig.lengthM) / RIVER_DEFAULTS.lengthM);
      const span = (high - low) * spanRatio;
      const rows = Math.max(4, Math.ceil(span / 16)),
        cols = Math.max(4, Math.ceil((sideHigh - sideLow) / 16));
      const point = (r: number, c: number): PlanPoint => {
        const u = low + (high - low) * (Number(((1 - spanRatio) / 2).toFixed(12)) + (spanRatio * r) / (rows - 1)),
          v = sideLow + ((sideHigh - sideLow) * (c + 0.5)) / cols;
        return vertical ? { x: v, z: u } : { x: u, z: v };
      };
      // A flat water surface needs a low elevation band, not the lowest point at every row.
      // Cache samples once; a low quantile avoids both mountain cuts and hugging the shoreline.
      const heights = new Float64Array(rows * cols).fill(NaN),
        candidates: number[] = [];
      const margin = riverConfig.widthMaxM / 2 + riverConfig.bankWidthM + 4;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const p = point(r, c);
          if (!land.inside(p) || land.distance(p, margin) < margin) continue;
          const height = ground(p);
          if (height < 1) continue;
          heights[r * cols + c] = height;
          candidates.push(height);
        }
      candidates.sort((a, b) => a - b);
      const targetHeight = candidates[Math.floor(candidates.length * 0.2)] ?? 0;
      const costs = new Float64Array(rows * cols).fill(Infinity),
        parents = new Int32Array(rows * cols).fill(-1);
      const phase = settlementRandom(plan.parameters.seed, `river:${river}:bend`) * Math.PI * 2;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const p = point(r, c),
            cfg = riverConfig;
          const height = heights[r * cols + c];
          if (!Number.isFinite(height)) continue;
          const preferred =
            (sideLow + sideHigh) / 2 +
            (river
              ? (settlementRandom(plan.parameters.seed, `river:${river}:lane`) - 0.5) * (sideHigh - sideLow) * 0.65
              : 0) +
            Math.sin(((vertical ? p.z : p.x) / Math.max(1, cfg.bendScaleM)) * Math.PI * 2 + phase) * cfg.bendM;
          const separation = staged.reduce((sum, prior) => {
            const gap = Math.min(...prior.water.centerline!.map((q) => distance(p, q)));
            return sum + Math.max(0, 96 - gap) * 0.3;
          }, 0);
          const penalty =
            separation +
            1 +
            (height - targetHeight) ** 2 * 0.08 +
            height * 0.03 +
            Math.abs((vertical ? p.x : p.z) - preferred) * 0.025 +
            2 / (1 + cfg.preference);
          const id = r * cols + c;
          if (!r) {
            costs[id] = penalty;
            continue;
          }
          for (let dc = -2; dc <= 2; dc++) {
            const pc = c + dc;
            if (pc < 0 || pc >= cols) continue;
            const previous = (r - 1) * cols + pc;
            const cost = costs[previous] + penalty + Math.abs(dc) * 0.6;
            if (cost < costs[id]) {
              costs[id] = cost;
              parents[id] = previous;
            }
          }
        }
      let end = -1;
      for (let c = 0; c < cols; c++) {
        const id = (rows - 1) * cols + c;
        if (Number.isFinite(costs[id]) && (end < 0 || costs[id] < costs[end])) end = id;
      }
      if (end < 0) {
        continue;
      }
      const path: PlanPoint[] = [];
      for (let at = end; at >= 0; at = parents[at]) path.push(point(Math.floor(at / cols), at % cols));
      path.reverse();
      const base = smoothPath(path);
      const points = smoothPath(
          base.map((p, i) => {
            const cfg = rules(p, riverConfig),
              a = base[Math.max(0, i - 1)],
              b = base[Math.min(base.length - 1, i + 1)],
              length = distance(a, b) || 1;
            const nx = -(b.z - a.z) / length,
              nz = (b.x - a.x) / length;
            const owners = owner(p, 24);
            const attraction = owners.reduce(
              (sum, n) =>
                sum +
                n.weight *
                  ((local[n.site.id]?.preference ?? riverConfig.preference) - riverConfig.preference) *
                  ((n.site.center.x - p.x) * nx + (n.site.center.z - p.z) * nz) *
                  0.1,
              0
            );
            const offset =
              cfg.bendM * 0.6 * Math.sin(((vertical ? p.z : p.x) / Math.max(1, cfg.bendScaleM)) * Math.PI * 2 + phase) +
              attraction;
            const available = Math.max(0, land.distance(p, Infinity) - cfg.widthMaxM / 2 - cfg.bankWidthM - 2);
            const shift = Math.max(-available, Math.min(available, offset));
            // Bend is a shape preference: preserve the lowland corridor instead of adding
            // a decorative meander that cuts into a hill or drops the flat level at the coast.
            const elevation = ground(p);
            let best = p,
              bestCost = 1;
            for (const fraction of [0.25, 0.5, 0.75, 1]) {
              const candidate = { x: p.x + nx * shift * fraction, z: p.z + nz * shift * fraction };
              const delta = ground(candidate) - elevation;
              const cost = (1 - fraction) ** 2 + delta * delta;
              if (cost < bestCost) {
                best = candidate;
                bestCost = cost;
              }
            }
            return best;
          })
        ),
        widths: number[] = [],
        depths: number[] = [],
        banks: number[] = [];
      // Length is measured along the curve, not across its bounding box.
      let travelled = 0;
      for (let i = 1; i < points.length; i++) {
        const segment = distance(points[i - 1], points[i]);
        if (travelled + segment > riverConfig.lengthM) {
          const t = (riverConfig.lengthM - travelled) / segment,
            a = points[i - 1],
            b = points[i];
          points.splice(i, points.length - i, { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
          break;
        }
        travelled += segment;
      }
      let arc = 0,
        ceiling = Infinity;
      for (let i = 0; i < points.length; i++) {
        const p = points[i],
          cfg = rules(p, riverConfig);
        if (i) arc += distance(points[i - 1], p);
        widths.push(
          cfg.widthMinM +
            (cfg.widthMaxM - cfg.widthMinM) * (0.5 + 0.5 * Math.sin(arc / Math.max(1, cfg.bendScaleM) + phase))
        );
        depths.push(
          cfg.depthMinM +
            (cfg.depthMaxM - cfg.depthMinM) * (0.5 + 0.5 * Math.sin(arc / Math.max(1, cfg.bendScaleM) + phase + 1.7))
        );
        banks.push(cfg.bankWidthM);
      }
      const outline = ribbonOutline(points, widths, undefined, true);
      if (!land.containsPolygon(outline)) continue;
      // A flat level must fit every bank, including the end caps. Never raise dry terrain to hide overflow.
      for (const p of outline) ceiling = Math.min(ceiling, ground(p) - 0.5);
      const crossed = new Set(points.flatMap((p) => owner(p, 0).map((n) => n.site.id)));
      checks.push({
        id: `river:${river}:extent`,
        owners: [`river:${river}`],
        rule: "river-extent",
        required: false,
        status: arc + 1 >= riverConfig.lengthM ? "pass" : "unknown",
        message: `河流实际长度 ${arc.toFixed(1)} 米，跨越 ${crossed.size} 个 POI 管理区；请求长度 ${riverConfig.lengthM} 米`,
        measured: arc,
        limit: riverConfig.lengthM
      });
      staged.push({
        water: {
          id,
          label: `河流 ${river + 1}`,
          kind: "river",
          outline,
          centerline: points,
          widths,
          bankWidthM: Math.max(...banks),
          bankWidths: banks
        },
        depths,
        banks,
        ceiling
      });
      break;
    }
  }
  for (const stagedRiver of staged) {
    const { water, depths } = stagedRiver;
    let levels = stagedRiver.levels;
    if (!levels) {
      const cfg = { ...config, ...local[water.id] };
      const points = water.centerline!;
      if (ground(points[0]) < ground(points.at(-1)!)) {
        points.reverse();
        water.widths!.reverse();
        depths.reverse();
        water.bankWidths!.reverse();
      }
      let prior = Infinity;
      levels = points.map((p, i) => {
        const prev = points[Math.max(0, i - 1)],
          next = points[Math.min(points.length - 1, i + 1)],
          length = distance(prev, next) || 1;
        const nx = -(next.z - prev.z) / length,
          nz = (next.x - prev.x) / length,
          width = water.widths![i] / 2;
        const ceiling =
          Math.min(
            ground(p),
            ground({ x: p.x + nx * width, z: p.z + nz * width }),
            ground({ x: p.x - nx * width, z: p.z - nz * width })
          ) - 0.05;
        return (prior = Math.min(prior, ceiling, cfg.automaticLevel ? Infinity : cfg.waterY));
      });
      // The full mitered outline and end caps constrain each local profile, not a shared world datum.
      for (const shore of water.outline) {
        let nearest = Infinity,
          index = 0;
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1],
            b = points[i],
            dx = b.x - a.x,
            dz = b.z - a.z;
          const t = Math.max(0, Math.min(1, ((shore.x - a.x) * dx + (shore.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
          const distance = Math.hypot(shore.x - a.x - dx * t, shore.z - a.z - dz * t);
          if (distance < nearest) {
            nearest = distance;
            index = i;
          }
        }
        const ceiling = ground(shore) - 0.05;
        levels[index - 1] = Math.min(levels[index - 1], ceiling);
        levels[index] = Math.min(levels[index], ceiling);
      }
      for (let i = 1; i < levels.length; i++) levels[i] = Math.min(levels[i], levels[i - 1]);
      // A side-bank constraint is not a natural cliff. Lower upstream samples to
      // keep the generated ordinary reach within the backend's slope contract.
      // Real centreline ledges retain their discontinuity for automatic classification.
      for (let i = levels.length - 2; i >= 0; i--) {
        if (cfg.sections?.some((s) => s.from === `${water.id}:anchor:${i}`)) continue;
        const a = points[i],
          b = points[i + 1],
          length = distance(a, b),
          n = Math.max(1, Math.ceil(length / 0.25));
        let naturalLedge = false,
          previous = ground(a);
        for (let j = 1; j <= n; j++) {
          const h = ground({ x: a.x + ((b.x - a.x) * j) / n, z: a.z + ((b.z - a.z) * j) / n });
          naturalLedge ||= previous - h >= 0.5 && (previous - h) / (length / n) >= 0.2;
          previous = h;
        }
        if (!naturalLedge) levels[i] = Math.min(levels[i], levels[i + 1] + length * 0.19);
      }

      if (!cfg.automaticLevel && levels.some((y) => y < cfg.waterY - 1e-6))
        checks.push({
          id: `${water.id}:water-level`,
          owners: [water.id],
          rule: "river-water-level",
          required: false,
          status: "unknown",
          message: `请求水位 ${cfg.waterY} 米，岸顶约束后逐段水位为 ${Math.min(...levels).toFixed(2)}–${Math.max(...levels).toFixed(2)} 米；保留请求参数`,
          measured: Math.min(...levels),
          limit: cfg.waterY
        });
      const anchors = points.map((p, i) => ({
        id: `${water.id}:anchor:${i}`,
        ...p,
        elevation: levels![i],
        width: water.widths![i],
        depth: depths[i]
      }));
      const course = resolveWatercourse({ id: water.id, points: anchors, sections: cfg.sections }, (x, z) =>
        ground({ x, z })
      );
      const geometry = watercourseGeometry(course);
      water.course = course;
      water.centerline = geometry.points.map((p) => ({ x: p.x, z: p.z }));
      water.widths = geometry.points.map((p) => p.width);
      water.bankWidths = geometry.points.map(() => cfg.bankWidthM);
      depths.splice(0, depths.length, ...geometry.points.map((p) => p.depth));
      levels = geometry.points.map((p) => p.elevation);
    }
    plan.waters.push(water);
    const points = water.centerline!,
      width = Math.max(...water.widths!);
    plan.planning!.profiles.push(
      {
        id: water.id + ":surface",
        ownerId: water.id,
        kind: "water",
        points: points.map((p, i) => ({ ...p, y: levels![i] })),
        width,
        supportIds: []
      },
      {
        id: water.id + ":bed",
        ownerId: water.id,
        kind: "bed",
        points: points.map((p, i) => ({ ...p, y: levels![i] - depths[i] })),
        width,
        supportIds: []
      }
    );
  }
  if (plan.waters.length < config.count)
    checks.push({
      id: "river:count",
      owners: ["world"],
      rule: "river-generation",
      required: false,
      status: "unknown",
      message: `请求 ${config.count} 条河流，本次生成 ${plan.waters.length} 条；部分走廊无法容纳当前形状与岸线，保留请求参数`,
      measured: plan.waters.length,
      limit: config.count
    });
  return checks;
}
