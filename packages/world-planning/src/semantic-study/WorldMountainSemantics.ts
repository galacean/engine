import type { IslandPlan, PlanPoint } from "./IslandPlanModel";
import { createPlanningRingQuery } from "./WorldPlanningTerrain";
import { sampleScalarGrid, scalarContours } from "./WorldScalarContours";
import { ringArea } from "./WorldPlanningGeometry";

/** Connected rounded group regions follow actual elongated rock masses; they are not rectangular component unions.
 * Keep distant groups separate and clip against real land, water and occupied places.
 */
export function finalizeMountainSemantics(plan: IslandPlan): void {
  const lands = [plan.land, ...plan.islands].map(createPlanningRingQuery);
  const exclusions = [
    ...plan.waters.map((w) => w.outline),
    ...plan.regions.filter((r) => r.kind === "village" || r.kind === "teleport").map((r) => r.outline)
  ].map(createPlanningRingQuery);
  const landCenter = plan.land.reduce(
    (p, q) => ({ x: p.x + q.x / plan.land.length, z: p.z + q.z / plan.land.length }),
    { x: 0, z: 0 }
  );
  const centers = new Map(
    plan.mountains.map((m) => {
      const rocks = plan.rocks.filter((r) => r.groupId === m.id);
      return [
        m.id,
        rocks.reduce((p, r) => ({ x: p.x + r.center.x / rocks.length, z: p.z + r.center.z / rocks.length }), {
          x: 0,
          z: 0
        })
      ];
    })
  );
  for (const mountain of plan.mountains) {
    const rocks = plan.rocks.filter((r) => r.groupId === mountain.id);
    if (!rocks.length) continue;
    const center = centers.get(mountain.id)!,
      land = lands.find((r) => r.inside(center));
    if (!land) continue;
    const points = rocks.flatMap((r) => r.obb),
      x0 = Math.floor((Math.min(...points.map((p) => p.x)) - 96) / 8) * 8,
      z0 = Math.floor((Math.min(...points.map((p) => p.z)) - 96) / 8) * 8,
      x1 = Math.max(...points.map((p) => p.x)) + 96,
      z1 = Math.max(...points.map((p) => p.z)) + 96;
    const margin = Math.min(
      ...points.map((p) => land.distance(p, 12)),
      ...points.flatMap((p) => exclusions.filter((r) => r.within(p, 12)).map((r) => r.distance(p, 12)))
    );
    // Refine tight coastal/river gaps so a safe interpolation margin never cuts an accepted solid.
    const contourStep = Math.max(0.5, Math.min(4, margin / 3)),
      clearance = contourStep * Math.SQRT1_2 + 0.25;
    const shapes = rocks.map((r) => ({
      center: r.center,
      u: Math.cos(r.yaw),
      v: Math.sin(r.yaw),
      a: r.width * 0.8 + 12,
      b: r.depth * 0.8 + 12
    }));
    const field = (p: PlanPoint) => {
      let value = -1000;
      for (const shape of shapes) {
        const dx = p.x - shape.center.x,
          dz = p.z - shape.center.z;
        value = Math.max(
          value,
          (1 - Math.hypot((dx * shape.u + dz * shape.v) / shape.a, (-dx * shape.v + dz * shape.u) / shape.b)) *
            Math.min(shape.a, shape.b)
        );
      }
      value = Math.min(value, (land.inside(p) ? 1 : -1) * land.distance(p, 100) - clearance);
      for (const region of exclusions)
        if (region.within(p, Math.max(8, value + clearance)))
          value = Math.min(
            value,
            (region.inside(p) ? -1 : 1) * region.distance(p, Math.max(8, value + clearance)) - clearance
          );
      return value;
    };
    const outlines = scalarContours(sampleScalarGrid(x0, z0, x1 - x0, z1 - z0, contourStep, field), 0)
      .filter((r) => r.length > 5 && Math.hypot(r[0].x - r.at(-1)!.x, r[0].z - r.at(-1)!.z) < 0.01)
      .map((r) => r.slice(0, -1))
      .filter((r) => ringArea(r) > 32)
      .sort((a, b) => ringArea(b) - ringArea(a));
    mountain.semanticOutlines = outlines;
    const direction = (() => {
      const angle = Math.atan2(center.z - landCenter.z, center.x - landCenter.x);
      return ["东部", "东南", "南部", "西南", "西部", "西北", "北部", "东北"][
        (Math.round(angle / (Math.PI / 4)) + 8) % 8
      ];
    })();
    const roles: NonNullable<typeof mountain.roles> = [];
    const mains = plan.mountains.filter((m) => !m.offshore);
    const sources = plan.waters
      .filter((w) => w.kind === "river" && w.centerline?.length && !w.id.includes("branch"))
      .filter((w) => {
        const source = w.centerline![0];
        const distance = (id: string) =>
          Math.min(
            ...plan.rocks
              .filter((r) => r.groupId === id)
              .map((r) => Math.hypot(r.center.x - source.x, r.center.z - source.z))
          );
        return mains.reduce((best, m) => (distance(m.id) < distance(best.id) ? m : best), mains[0])?.id === mountain.id;
      });
    if (sources.length)
      roles.push({
        kind: "headwater",
        relatedIds: sources.map((w) => w.id),
        description: `抬升源区，${sources.map((w) => w.label).join("、")}由山脚流出`
      });
    const valleyIds: string[] = [];
    for (const valley of plan.planning?.modules.filter((m) => m.kind === "valley") ?? []) {
      const water = plan.waters.find((w) => valley.dependencies.includes(w.id) && w.centerline?.length);
      if (!water?.centerline?.length) continue;
      const line = water.centerline;
      let nearest: { point: PlanPoint; dx: number; dz: number; gap: number } | undefined;
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1],
          b = line[i],
          dx = b.x - a.x,
          dz = b.z - a.z,
          t = Math.max(0, Math.min(1, ((center.x - a.x) * dx + (center.z - a.z) * dz) / (dx * dx + dz * dz || 1))),
          point = { x: a.x + dx * t, z: a.z + dz * t },
          gap = Math.hypot(center.x - point.x, center.z - point.z);
        if (!nearest || gap < nearest.gap) nearest = { point, dx, dz, gap };
      }
      if (!nearest || nearest.gap > 300) continue;
      const n = nearest,
        side = n.dx * (center.z - n.point.z) - n.dz * (center.x - n.point.x);
      if (
        mains.some((m) => {
          const other = centers.get(m.id)!;
          return (
            m.id !== mountain.id &&
            (n.dx * (other.z - n.point.z) - n.dz * (other.x - n.point.x)) * side < 0 &&
            Math.hypot(other.x - n.point.x, other.z - n.point.z) < 350
          );
        })
      )
        valleyIds.push(valley.id);
    }
    if (valleyIds.length && !plan.structures?.some((s) => s.bankIds.includes(mountain.id)))
      roles.push({
        kind: "valley-wall",
        relatedIds: valleyIds,
        description: "与对岸山体共同夹出河谷侧壁；尚不代表已形成陡峭峡谷"
      });
    const views = plan.sights.filter((s) => s.status === "pass" && rocks.some((r) => r.id === s.targetId));
    if (views.length)
      roles.push({
        kind: "visual-landmark",
        relatedIds: views.map((s) => s.id),
        description: `作为 ${views.length} 个观察点的可见地标；不等于近中远构图已成立`
      });
    if (!roles.length)
      roles.push({
        kind: mountain.offshore ? "coastal-ridge" : "watershed",
        relatedIds: [],
        description: mountain.offshore ? "构成离岛的地势与海岸轮廓" : "组织连续高地与山脚过渡，尚无达成的夹谷或观景关系"
      });
    const structure = plan.structures?.find((s) => s.bankIds.includes(mountain.id));
    if (structure)
      roles.unshift({
        kind: "valley-wall",
        relatedIds: [structure.id],
        description: "沿峡谷通道组装的连续岩壁，与对岸共同保留谷底；地势由峡谷剖面驱动"
      });
    mountain.roles = roles;
    const role = roles.some((r) => r.kind === "valley-wall")
      ? "河谷侧壁"
      : roles.some((r) => r.kind === "headwater")
        ? "源头山脊"
        : roles.some((r) => r.kind === "visual-landmark")
          ? "眺望地标"
          : mountain.offshore
            ? "离岛山脊"
            : "分水高地";
    mountain.label = `${structure ? (structure.bankIds[0] === mountain.id ? "峡谷左岸岩壁" : "峡谷右岸岩壁") : direction + role} · 地面${Math.round(Math.max(...rocks.map((r) => r.baseHeight ?? 0)))}m`;
    const module = plan.planning?.modules.find((m) => m.id === mountain.id);
    if (module && outlines.length) {
      if (!mountain.offshore) {
        module.outline = outlines[0];
        module.outlines = outlines;
      }
      module.resolved.semanticArea = outlines.reduce((s, r) => s + ringArea(r), 0);
    }
  }
}
