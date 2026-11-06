import type { IslandPlan, PlanPoint } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import {
  createPlanningGroundSampler,
  createPlanningRingQuery
} from "@galacean/engine-world-planning/semantic-study/WorldPlanningTerrain";
import {
  resolveWatercourse,
  type WatercoursePoint,
  type WatercourseSection,
  watercourseGeometry
} from "@galacean/engine-water/water/index";

type RiverCase = "stream" | "river" | "waterfall" | "steps";
type OccupiedSite = { center: PlanPoint; radius: number };

/** Initial showcase authoring only. Terrain and native Water still compile through Planner. */
export class WaterPreviewSites {
  private readonly ground: (p: PlanPoint) => number;
  private readonly land: ReturnType<typeof createPlanningRingQuery>;
  private readonly water: ReturnType<typeof createPlanningRingQuery>[];
  private readonly occupied: OccupiedSite[] = [];
  private focus: PlanPoint;

  constructor(private readonly plan: IslandPlan) {
    this.ground = createPlanningGroundSampler({ ...plan, waters: [] });
    this.land = createPlanningRingQuery(plan.land);
    this.water = plan.waters.map((w) => createPlanningRingQuery(w.outline));
    this.focus = { x: plan.parameters.width / 2, z: plan.parameters.depth / 2 };
  }

  private candidates(radius: number): PlanPoint[] {
    const points: PlanPoint[] = [];
    for (let z = 32; z < this.plan.parameters.depth - 32; z += 8)
      for (let x = 32; x < this.plan.parameters.width - 32; x += 8) {
        const p = { x, z };
        if (!this.land.inside(p) || this.land.distance(p, radius + 2) < radius + 2 || this.ground(p) < 2) continue;
        if (this.occupied.some((s) => Math.hypot(s.center.x - x, s.center.z - z) < radius + s.radius + 4)) continue;
        if (this.water.some((w) => w.inside(p) || w.distance(p, radius + 3) < radius + 3)) continue;
        points.push(p);
      }
    return points.sort(
      (a, b) =>
        Math.hypot(a.x - this.focus.x, a.z - this.focus.z) - Math.hypot(b.x - this.focus.x, b.z - this.focus.z) ||
        a.x - b.x ||
        a.z - b.z
    );
  }

  lake(): { center: PlanPoint; radius: number; referenceLevel: number } {
    const radius = 7,
      margin = radius + 2 * this.plan.raster!.spacing + 3;
    for (const center of this.candidates(Math.SQRT2 * margin)) {
      const range = (step: number) => {
        let min = Infinity,
          max = -Infinity;
        for (let z = -margin; z <= margin; z += step)
          for (let x = -margin; x <= margin; x += step) {
            const h = this.ground({ x: center.x + x, z: center.z + z });
            min = Math.min(min, h);
            max = Math.max(max, h);
          }
        return { min, max };
      };
      // Coarse rejection only; the accepted site's datum retains the original 0.5m author probes.
      const coarse = range(2);
      if (coarse.max - coarse.min > 0.8) continue;
      const heights = range(0.5);
      if (heights.max - heights.min > 0.8) continue;
      this.occupied.push({ center, radius: Math.SQRT2 * margin });
      this.focus = center;
      return { center, radius, referenceLevel: heights.min - 0.1 };
    }
    throw new Error("水体展示选址不足：未找到湖岸与捕获范围起伏不超过 0.8 米的地块；不会压低水位挖深坑。");
  }

  river(kind: RiverCase): { points: WatercoursePoint[]; sections: WatercourseSection[] } {
    const width = kind === "stream" ? 1 : kind === "river" ? 4 : 3,
      depth = kind === "stream" ? 0.1 : 0.6;
    const drop = kind === "waterfall" || kind === "steps",
      count = kind === "steps" ? 3 : 1;
    const length = 32,
      bank = 2;
    for (const center of this.candidates(20)) {
      const dx = this.ground({ x: center.x + 2, z: center.z }) - this.ground({ x: center.x - 2, z: center.z });
      const dz = this.ground({ x: center.x, z: center.z + 2 }) - this.ground({ x: center.x, z: center.z - 2 });
      const gradient = Math.hypot(dx, dz);
      // Initial drop showcases use the dominant downhill grid axis, so their narrow cliff
      // meets the existing Terrain grid cleanly. This is not a constraint on authored River edits.
      const direction = drop
        ? Math.abs(dx) > Math.abs(dz)
          ? { x: dx > 0 ? -1 : 1, z: 0 }
          : { x: 0, z: dz > 0 ? -1 : 1 }
        : gradient > 1e-8
          ? { x: -dx / gradient, z: -dz / gradient }
          : { x: 0, z: 1 };
      const pointAt = (t: number) => ({
        x: center.x + (t - 0.5) * length * direction.x,
        z: center.z + (t - 0.5) * length * direction.z
      });
      const cross = (p: PlanPoint, side: number) => ({ x: p.x - direction.z * side, z: p.z + direction.x * side });
      const groundAt = (t: number) =>
        Math.min(...[-width / 2 - bank, 0, width / 2 + bank].map((side) => this.ground(cross(pointAt(t), side))));
      const sections: WatercourseSection[] = [];
      let points: WatercoursePoint[];
      if (drop) {
        // Upper platforms must be supported to their lip; the receiving level follows actual downstream land.
        let upper = Infinity,
          lower = Infinity;
        for (let i = 0; i <= 128; i++) {
          const t = i / 128,
            h = groundAt(t);
          if (t <= 1 / (count + 1)) upper = Math.min(upper, h);
          if (t >= count / (count + 1)) lower = Math.min(lower, h);
        }
        upper -= 0.08;
        lower -= 0.08;
        if (upper - lower < (kind === "steps" ? 1.2 : 0.8) || upper - lower > 3) continue;
        let excess = 0;
        for (let i = 0; i <= 128; i++) {
          const t = i / 128,
            stage = Math.min(count, Math.floor(t * (count + 1)));
          excess = Math.max(excess, upper + ((lower - upper) * stage) / count - groundAt(t));
        }
        points = [
          { id: `${kind}-up`, ...pointAt(0), elevation: upper - excess, width, depth },
          { id: `${kind}-down`, ...pointAt(1), elevation: lower - excess, width, depth }
        ];
        sections.push({
          id: `${kind}-section`,
          from: points[0].id,
          to: points[1].id,
          form: kind,
          carve: true,
          stepCount: 3
        });
      } else {
        points = Array.from({ length: 17 }, (_, i) => ({
          id: `${kind}-p${i}`,
          ...pointAt(i / 16),
          elevation: groundAt(i / 16) - 0.08,
          width,
          depth
        }));
        // A monotone, bounded-grade author profile; do not flatten the whole reach to its lowest end.
        for (let i = 1; i < points.length; i++)
          points[i] = { ...points[i], elevation: Math.min(points[i].elevation!, points[i - 1].elevation!) };
        for (let i = points.length - 2; i >= 0; i--)
          points[i] = { ...points[i], elevation: Math.min(points[i].elevation!, points[i + 1].elevation! + 0.18 * 2) };
      }
      let course: ReturnType<typeof resolveWatercourse>;
      try {
        course = resolveWatercourse({ id: kind, points, sections }, (x, z) => this.ground({ x, z }));
      } catch (error) {
        if (error instanceof Error && /^(INVALID_ARGUMENT|TERRAIN_CHANGE_REQUIRED):/.test(error.message)) continue;
        throw error;
      }
      // Check actual generated platforms, including the top/bottom of each curtain.
      let maxCut = 0,
        unsupported = false;
      const geometry = watercourseGeometry(course);
      for (const path of geometry.paths)
        for (let i = 1; i < path.length; i++) {
          const a = path[i - 1],
            b = path[i],
            n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25));
          for (let j = 0; j <= n; j++) {
            const t = j / n,
              p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t },
              level = a.elevation + (b.elevation - a.elevation) * t;
            for (const side of [-width / 2 - bank, -width / 2, 0, width / 2, width / 2 + bank]) {
              const original = this.ground(cross(p, side));
              unsupported ||= original < level;
              maxCut = Math.max(maxCut, original - level + depth);
            }
          }
        }
      for (const curtain of geometry.drops) {
        for (const position of [curtain.upper, curtain.lower])
          for (const side of [-width / 2 - bank, 0, width / 2 + bank])
            maxCut = Math.max(
              maxCut,
              this.ground(cross({ x: position[0], z: position[2] }, side)) - curtain.lower[1] + depth
            );
      }
      // Site-selection budgets, not engine/edit limits. Preserve requested width, depth and sampling precision.
      if (unsupported || maxCut > (drop ? 2.5 : depth + 0.6)) continue;
      this.occupied.push({ center, radius: 20 });
      return { points, sections };
    }
    throw new Error(`水体展示选址不足：${kind} 未找到满足地形支撑和浅开挖要求的河道；不会强行压低整条河流。`);
  }
}
