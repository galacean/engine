import { bridgeGround } from "../hydrology/RiverCrossings";
import { roadSurfaces } from "../layout/RoadTopology";
import type { IslandPlan, PlanPoint } from "../../semantic-study/IslandPlanModel";
import { createPlanningRingQuery, planningWaterHeight } from "../../semantic-study/WorldPlanningTerrain";
import { planningWhiteboxes } from "../../semantic-study/PlanningWhiteboxes";
import { WALK_METRICS } from "../../semantic-study/PlanningWalk";
import type { V2Box } from "../V2Model.ts";
import defaults from "./navigation.json";

export type StandIssue = "outside" | "water" | "slope" | "obstacle";
/** Conservative grounded walking domain. Rendering visibility never removes collision obstacles.
 * Heights are supplied from the same published R16 raster as rendering and PlanningWalk. */
export class TraversalSurface {
  readonly ground: (p: PlanPoint) => number;
  private lands;
  private waters;
  private roads;
  private bins = new Map<string, V2Box[]>();
  readonly radius = WALK_METRICS.radius;
  readonly height = WALK_METRICS.height;
  readonly slope = Math.tan((defaults.maxSlopeDegrees * Math.PI) / 180);
  constructor(
    readonly plan: IslandPlan,
    ground: (p: PlanPoint) => number
  ) {
    this.ground = bridgeGround(plan, ground);
    this.lands = [plan.land, ...plan.islands].map(createPlanningRingQuery);
    this.waters = plan.waters.map((w) => ({ id: w.id, ring: createPlanningRingQuery(w.outline) }));
    this.roads = roadSurfaces(plan)
      .filter((r) => r.outline?.length)
      .map((r) => ({ id: r.id, ring: createPlanningRingQuery(r.outline!) }));
    // Bridge decks are the support surface above, not obstacles protruding through that surface.
    for (const box of planningWhiteboxes(plan, ground)
      .filter((part) => part.layer !== "bridge")
      .flatMap((p) => p.boxes)
      .filter((b) => b.collision)) {
      const extent = Math.hypot(box.sizeX, box.sizeZ) / 2 + this.radius;
      for (let z = Math.floor((box.center.z - extent) / 16); z <= Math.floor((box.center.z + extent) / 16); z++)
        for (let x = Math.floor((box.center.x - extent) / 16); x <= Math.floor((box.center.x + extent) / 16); x++) {
          const key = `${x}:${z}`,
            list = this.bins.get(key) ?? [];
          list.push(box);
          this.bins.set(key, list);
        }
    }
  }
  issue(p: PlanPoint): StandIssue | undefined {
    const { x, z } = p,
      r = this.radius;
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(z) ||
      x < r ||
      z < r ||
      x > this.plan.parameters.width - r ||
      z > this.plan.parameters.depth - r ||
      !this.lands.some((land) => land.inside(p) && land.distance(p, r + 0.01) >= r)
    )
      return "outside";
    const y = this.ground(p);
    for (const w of this.waters)
      if (w.ring.within(p, r) && (w.ring.inside(p) || w.ring.distance(p, r) < r)) {
        const surface = planningWaterHeight(this.plan, w.id, p);
        if (surface === undefined || surface - y > defaults.maxWadingDepthM) return "water";
      }
    const gx = (this.ground({ x: x + r, z }) - this.ground({ x: x - r, z })) / (2 * r);
    const gz = (this.ground({ x, z: z + r }) - this.ground({ x, z: z - r })) / (2 * r);
    if (Math.hypot(gx, gz) > this.slope) return "slope";
    for (const b of this.bins.get(`${Math.floor(x / 16)}:${Math.floor(z / 16)}`) ?? []) {
      const bottom = b.elevation ?? this.ground(b.center);
      if (bottom >= y + this.height || bottom + b.sizeY <= y + 0.01) continue;
      const c = Math.cos(b.yaw),
        s = Math.sin(b.yaw),
        dx = x - b.center.x,
        dz = z - b.center.z;
      if (
        Math.hypot(
          Math.max(0, Math.abs(c * dx + s * dz) - b.sizeX / 2),
          Math.max(0, Math.abs(-s * dx + c * dz) - b.sizeZ / 2)
        ) <
        r + 0.05
      )
        return "obstacle";
    }
    return undefined;
  }
  /** Check the whole capsule corridor, including short obstacles between grid nodes. */
  connects(a: PlanPoint, b: PlanPoint): boolean {
    const length = Math.hypot(b.x - a.x, b.z - a.z),
      n = Math.max(1, Math.ceil(length / defaults.edgeSampleM));
    let last = this.ground(a);
    for (let i = 0; i <= n; i++) {
      const p = { x: a.x + ((b.x - a.x) * i) / n, z: a.z + ((b.z - a.z) * i) / n };
      if (this.issue(p)) return false;
      const y = this.ground(p);
      if (i && Math.abs(y - last) > (this.slope * length) / n + 0.005) return false;
      last = y;
    }
    return true;
  }
  roadAt(p: PlanPoint): string | undefined {
    return this.roads.find((r) => r.ring.inside(p))?.id;
  }
}
