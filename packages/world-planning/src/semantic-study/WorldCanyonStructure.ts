import { planCanyonFootprints } from "./WorldCanyonFootprints";
import type { PlanLandformStructure, PlanPoint, PlanRock } from "./IslandPlanModel";
import type { WorldLayoutContext } from "./WorldLayoutPlanner";
import { createPlanningRingQuery } from "./WorldPlanningTerrain";
import { envelope } from "./IslandPlanAtoms";
import { ribbonOutline } from "./WorldRibbon";
import { contains, ringArea } from "./WorldPlanningGeometry";

const distance = (a: PlanPoint, b: PlanPoint) => Math.hypot(b.x - a.x, b.z - a.z);
/** Section coordinates are shared by the rock assembler, terrain sampler and map. */
export function canyonSection(structure: PlanLandformStructure, index: number) {
  const points = structure.axis,
    p = points[index],
    a = points[Math.max(0, index - 1)],
    b = points[Math.min(points.length - 1, index + 1)];
  const angle = Math.atan2(b.z - a.z, b.x - a.x);
  return { p, angle, normal: { x: -Math.sin(angle), z: Math.cos(angle) } };
}
/** Plan a connected negative corridor before placing any solid rock.
 * Search depends on the actual coastline, not seed-specific positions. No candidate means no canyon claim.
 */
export function planCanyon(c: WorldLayoutContext): void {
  if (c.parameters.canyonStudy) {
    planCanyonFootprints(c);
    return;
  }
  if (!c.parameters.draftLayout || c.parameters.mountains < 2) return;
  const land = createPlanningRingQuery(c.plan.land),
    id = "valley-main";
  const floorWidth = 140 * (c.edits[id]?.width ?? 1),
    bankWidth = 66;
  const outer = floorWidth / 2 + bankWidth + 34;
  let best: { axis: PlanPoint[]; outlet: PlanPoint; score: number } | undefined;
  for (const span of [720, 600, 480]) {
    for (let z = 300; z < 1800; z += 160)
      for (let x = 300; x < 1800; x += 160)
        for (const turn of [0, 0.35, -0.35, Math.PI]) {
          const angle = c.frame.angle + turn,
            dx = Math.cos(angle),
            dz = Math.sin(angle);
          const bend = 28 + 40 * (c.edits[id]?.bend ?? 0.5);
          const axis = Array.from({ length: 11 }, (_, i) => {
            const t = i / 10,
              u = (t - 0.5) * span,
              v = Math.sin(t * Math.PI * 2) * bend;
            return { x: x + u * dx - v * dz, z: z + u * dz + v * dx };
          });
          if (!axis.slice(1).every((p, i) => land.containsSegment(axis[i], p, outer))) continue;
          const a = axis.at(-2)!,
            b = axis.at(-1)!,
            len = distance(a, b),
            u = (b.x - a.x) / len,
            v = (b.z - a.z) / len;
          let outlet = b;
          for (let d = 8; d < 2200; d += 8) {
            const p = { x: b.x + u * d, z: b.z + v * d };
            outlet = p;
            if (!land.inside(p)) break;
          }
          if (Math.min(outlet.x, outlet.z, 2048 - outlet.x, 2048 - outlet.z) < 70) continue;
          const score = span - distance(b, outlet) * 0.15 + c.random(`canyon-${x}-${z}-${turn}`) * 20;
          if (!best || score > best.score) best = { axis, outlet, score };
        }
    if (best) break;
  }
  if (!best) {
    c.notes.push("当前陆域无法容纳连续双岸峡谷，未发布峡谷结构");
    return;
  }
  const outline = ribbonOutline(
    best.axis,
    best.axis.slice(1).map((_, i) => (outer - 10) * 2 * (0.96 + 0.04 * Math.sin(i)))
  );
  const floor = ribbonOutline(best.axis, [floorWidth]);
  if (!contains(c.plan.land, outline) || !contains(c.plan.land, floor)) return;
  const elevation = c.plan.parameters.globalElevation ?? 120;
  const structure: PlanLandformStructure = {
    id,
    kind: "canyon",
    label: "双岸峡谷",
    axis: best.axis,
    outlet: best.outlet,
    outline,
    floor,
    floorWidth,
    bankWidth,
    relief: elevation * 0.7,
    sourceHeight: elevation * 0.65,
    outletHeight: elevation * 0.15,
    bankIds: ["mountain-0", "mountain-1"]
  };
  c.plan.structures = [structure];
  // Reserve the channel continuation too, so later mountains cannot sever its outlet.
  const passage = [...structure.axis, structure.outlet];
  passage
    .slice(1)
    .forEach((b, i) =>
      c.reservations.push({ a: passage[i], b, width: i < structure.axis.length - 1 ? floorWidth / 2 : 45 })
    );
  for (const [bank, side] of [-1, 1].entries()) {
    const groupId = structure.bankIds[bank],
      rocks: PlanRock[] = [],
      ridge: PlanPoint[] = [];
    for (let i = 0; i < structure.axis.length; i++) {
      const { p, angle, normal } = canyonSection(structure, i),
        t = i / (structure.axis.length - 1);
      const offset = floorWidth / 2 + bankWidth / 2 + 12 + 8 * Math.sin(t * Math.PI * 2 + bank);
      const center = { x: p.x + normal.x * offset * side, z: p.z + normal.z * offset * side };
      ridge.push(center);
      const step = i ? distance(p, structure.axis[i - 1]) : distance(p, structure.axis[1]);
      const width = step * 1.12,
        depth = bankWidth * (0.88 + 0.1 * Math.sin(t * 5 + bank)),
        yaw = angle;
      const role: PlanRock["role"] = i === 2 ? "peak" : i === 0 || i === 10 ? "shoulder" : "wall";
      // Long wall faces, tapered shoulders and a crown silhouette share the bank tangent.
      const shape =
        role === "wall"
          ? [
              [-0.5, -0.43],
              [-0.2, -0.5],
              [0.5, -0.4],
              [0.47, 0.45],
              [0.1, 0.5],
              [-0.5, 0.4]
            ]
          : role === "peak"
            ? [
                [-0.5, -0.15],
                [-0.2, -0.5],
                [0.15, -0.45],
                [0.5, 0.02],
                [0.24, 0.5],
                [-0.35, 0.4]
              ]
            : [
                [-0.5, -0.12],
                [-0.1, -0.5],
                [0.5, -0.25],
                [0.43, 0.22],
                [-0.4, 0.5]
              ];
      const outline = shape.map(([u, v]) => ({
        x: center.x + u * width * Math.cos(yaw) - v * depth * Math.sin(yaw),
        z: center.z + u * width * Math.sin(yaw) + v * depth * Math.cos(yaw)
      }));
      rocks.push({
        id: `${groupId}-rock-${i}`,
        groupId,
        center,
        width,
        depth,
        yaw,
        height: (role === "peak" ? 90 : role === "wall" ? 65 : 35) * (1 - 0.3 * t),
        role,
        outline,
        obb: envelope(center, width, depth, yaw)
      });
    }
    const boundary = ribbonOutline(ridge, [bankWidth + 24]);
    c.plan.rocks.push(...rocks);
    c.plan.mountains.push({
      id: groupId,
      label: bank === 0 ? "峡谷左岸岩壁" : "峡谷右岸岩壁",
      outline: boundary,
      outlines: [boundary],
      densityOutlines: [boundary],
      rockIds: rocks.map((r) => r.id)
    });
    c.plan.ridges.push({ id: `${groupId}-ridge`, groupId, points: ridge });
    c.plan.planning?.modules.push({
      id: groupId,
      kind: "mountain",
      outline: boundary,
      dependencies: [id],
      requested: {},
      resolved: {
        rockCount: rocks.length,
        ridgeLength: ridge.slice(1).reduce((s, p, i) => s + distance(p, ridge[i]), 0)
      }
    });
  }
  c.plan.planning?.modules.push({
    id,
    kind: "valley",
    outline,
    dependencies: ["land-main", ...structure.bankIds],
    requested: { width: c.edits[id]?.width ?? 1, bend: c.edits[id]?.bend ?? 0.5 },
    resolved: {
      width: floorWidth,
      bankRelief: structure.relief,
      sourceHeight: structure.sourceHeight,
      outletHeight: structure.outletHeight,
      length: structure.axis.slice(1).reduce((s, p, i) => s + distance(p, structure.axis[i]), 0),
      area: ringArea(outline)
    }
  });
  c.plan.planning?.relations.push(
    ...structure.bankIds.map((bank) => ({
      id: `${bank}-frames-canyon`,
      kind: "frames" as const,
      owners: [bank, id],
      ports: [],
      required: true
    }))
  );
}
