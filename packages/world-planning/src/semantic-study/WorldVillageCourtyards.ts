import { PLANNING_REFERENCE } from "../planning-data/PlanningReference";
import type { IslandPlan, PlanPoint, PlanCourtyard } from "./IslandPlanModel";
import { envelope, routeIntersectsRock } from "./IslandPlanAtoms";
import { createPlanningGroundSampler, createPlanningRingQuery } from "./WorldPlanningTerrain";
import { WorldPlanningWaterQuery } from "./WorldPlanningWaterQuery";
import { ribbonOutline } from "./WorldRibbon";

/** Fit neutral courtyards around the existing random houses without moving any upstream layout.
 * Bounded expansion respects the village, neighbouring parcels and published circulation.
 * Houses without sufficient room remain explicit unallocated cases, never relocate other modules.
 */
export function updateVillageCourtyards(plan: IslandPlan, profile = PLANNING_REFERENCE): void {
  const c = profile.courtyard;
  const ground = createPlanningGroundSampler(plan),
    query = new WorldPlanningWaterQuery();
  plan.courtyards = [];
  for (const region of plan.regions.filter((r) => r.kind === "village")) {
    const inside = createPlanningRingQuery(region.outline),
      houses = plan.buildings.filter((b) => b.regionId === region.id);
    for (const b of houses) {
      const port = plan.planning?.ports.find((p) => p.id === b.id + "-door");
      if (!port) continue;
      const cos = Math.cos(b.yaw),
        sin = Math.sin(b.yaw),
        local = (p: PlanPoint) => ({
          x: (p.x - b.center.x) * cos + (p.z - b.center.z) * sin,
          z: -(p.x - b.center.x) * sin + (p.z - b.center.z) * cos
        });
      const world = (x: number, z: number) => ({
        x: b.center.x + x * cos - z * sin,
        z: b.center.z + x * sin + z * cos
      });
      const landing = local(port.position),
        axis = Math.abs(landing.x) / b.width > Math.abs(landing.z) / b.depth ? "x" : "z",
        sign = Math.sign(landing[axis]) || 1;
      let hash = plan.parameters.seed;
      for (const char of b.id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
      const desired = c.desiredMarginM.min + (((hash >>> 0) % 700) / 700) * c.desiredMarginM.span,
        aspect = c.depthPerMargin.min + (((hash >>> 8) % 60) / 60) * c.depthPerMargin.span;
      let fit: { width: number; depth: number; outline: PlanPoint[] } | undefined;
      for (let margin = c.marginMinM; margin <= desired; margin += c.marginStepM) {
        const width = b.width + 2 * margin,
          depth = b.depth + 2 * margin * aspect,
          outline = envelope(b.center, width, depth, b.yaw);
        if (
          !outline.every((p, i) => inside.containsSegment(p, outline[(i + 1) % outline.length], c.boundaryClearanceM))
        )
          break;
        if (
          houses.some((other) => other !== b && query.overlap(outline, other.outline)) ||
          plan.courtyards.some((c) => query.overlap(outline, c.outline))
        )
          break;
        const solid = { ...b, width, depth, groupId: b.regionId, role: "terrace" as const, obb: outline };
        const links = [...(region.navigationLinks ?? []), ...plan.routes];
        if (
          links.some((link) =>
            link.points.some(
              (p, i) => i > 0 && routeIntersectsRock(link.points[i - 1], p, solid, link.width / 2 + c.roadClearanceM)
            )
          )
        )
          break;
        fit = { width, depth, outline };
      }
      if (!fit || (axis === "x" ? fit.depth : fit.width) <= c.gateWidthM) continue;
      const hx = fit.width / 2,
        hz = fit.depth / 2,
        gate = axis === "x" ? world(sign * hx, 0) : world(0, sign * hz),
        door = axis === "x" ? world((sign * b.width) / 2, 0) : world(0, (sign * b.depth) / 2);
      const id = b.id + "-courtyard",
        yard: PlanCourtyard = {
          id,
          regionId: region.id,
          buildingId: b.id,
          outline: fit.outline,
          gate,
          door,
          gateWidth: c.gateWidthM,
          fences: [],
          path: {
            id: id + "-path",
            label: "院门至建筑入口",
            from: id,
            to: b.id,
            kind: "main",
            points: [gate, door],
            width: c.pathWidthM,
            outline: ribbonOutline([gate, door], [c.pathWidthM])
          }
        };
      const edge = (a: PlanPoint, z: PlanPoint) => {
        const length = Math.hypot(z.x - a.x, z.z - a.z),
          count = Math.ceil(length / c.fenceSegmentM);
        for (let j = 0; j < count; j++) {
          const center = { x: a.x + ((z.x - a.x) * (j + 0.5)) / count, z: a.z + ((z.z - a.z) * (j + 0.5)) / count };
          yard.fences.push({
            id: id + "-fence-" + yard.fences.length,
            label: "院落围栏",
            center,
            sizeX: length / count,
            sizeZ: c.fenceWidthM,
            sizeY: c.fenceHeightM,
            yaw: Math.atan2(z.z - a.z, z.x - a.x),
            elevation: ground(center) - c.fenceEmbedM,
            collision: true,
            occlusion: true
          });
        }
      };
      const corners = [
        [-hx, -hz],
        [hx, -hz],
        [hx, hz],
        [-hx, hz]
      ];
      for (let i = 0; i < 4; i++) {
        const a = corners[i],
          z = corners[(i + 1) % 4],
          isGate = axis === "x" ? a[0] === sign * hx && z[0] === sign * hx : a[1] === sign * hz && z[1] === sign * hz;
        if (!isGate) {
          edge(world(...(a as [number, number])), world(...(z as [number, number])));
          continue;
        }
        const dx = z[0] - a[0],
          dz = z[1] - a[1],
          length = Math.hypot(dx, dz),
          t = (length - yard.gateWidth) / 2 / length;
        edge(world(a[0], a[1]), world(a[0] + dx * t, a[1] + dz * t));
        edge(world(z[0] - dx * t, z[1] - dz * t), world(z[0], z[1]));
      }
      plan.courtyards.push(yard);
    }
  }
}
