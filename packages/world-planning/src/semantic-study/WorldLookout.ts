import { PLANNING_REFERENCE } from "../planning-data/PlanningReference";
import type { WorldLayoutContext } from "./WorldLayoutPlanner";
import { envelope } from "./IslandPlanAtoms";
import { contains, overlap } from "./WorldPlanningGeometry";
import { createPlanningGroundSampler } from "./WorldPlanningTerrain";
import { planningSightBlocked, PLANNING_TRAVERSAL } from "./WorldLayoutRoutes";

/** Choose a point destination from bounded, physically clear observation candidates.
 * Its small foundation is a support footprint, not an editable settlement region.
 * The score counts visible actual landmarks and their horizontal angular spread.
 * @param c Transaction containing the resolved terrain, solids and water.
 */
export function generateWorldLookout(c: WorldLayoutContext): void {
  const plan = c.plan,
    data = plan.planning;
  if (!data) return;
  const id = "teleport-0",
    ground = createPlanningGroundSampler(plan),
    height = PLANNING_REFERENCE.lookout.heightM * (c.edits[id]?.height ?? 1);
  const targets = plan.rocks
    .filter((r) => r.role === "peak")
    .map((r) => ({ id: r.id, point: r.center, height: ground(r.center) + r.height }));
  for (const water of plan.waters.filter((w) => w.kind === "lake")) {
    const p = data.profiles.find((p) => p.ownerId === water.id && p.kind === "water")?.points[0];
    if (p) targets.push({ id: water.id, point: p, height: p.y + 0.5 });
  }
  const solids = [
    ...plan.rocks,
    ...plan.buildings.map((b) => ({ ...b, groupId: b.regionId, role: "terrace" as const, obb: b.outline }))
  ];
  const scored = [];
  const fixed = c.edits[id]?.placement?.origin;
  for (let i = 0; i < (fixed ? 1 : 180); i++) {
    const point = fixed ?? { x: 100 + c.random(`lookout-x-${i}`) * 1848, z: 100 + c.random(`lookout-z-${i}`) * 1848 };
    const outline = envelope(point, 48, 48, 0),
      activity = { x: point.x - 14, z: point.z },
      entrance = { x: point.x - 24, z: point.z };
    if (
      !contains(plan.land, outline) ||
      plan.waters.some((w) => overlap(w.outline, outline)) ||
      solids.some((r) => overlap(r.obb, outline)) ||
      plan.regions.some((r) => r.kind === "village" && overlap(r.outline, outline))
    )
      continue;
    if (Math.abs(ground(activity) - ground(entrance)) / 10 > PLANNING_TRAVERSAL.maxSlope) continue;
    const visible = plan.landformStudy
      ? []
      : targets.filter(
          (t) => !planningSightBlocked(plan, point, ground(point) + height + 1.7, t.point, t.height, [t.id], ground)
        );
    const angles = visible.map((t) => Math.atan2(t.point.z - point.z, t.point.x - point.x));
    let spread = 0;
    for (const a of angles) for (const b of angles) spread = Math.max(spread, Math.acos(Math.cos(a - b)));
    scored.push({
      point,
      outline,
      activity,
      entrance,
      visible: visible.length,
      spread,
      score: visible.length + spread / Math.PI
    });
    if (plan.landformStudy) break;
  }
  scored.sort((a, b) => b.score - a.score);
  const site = scored[0];
  data.requiredIds.push(id);
  if (!site) {
    c.notes.push("眺望点在预算内未找到安全落脚位置");
    return;
  }
  const { point, outline, activity, entrance } = site,
    buildingId = `${id}-building-0`,
    doorId = `${buildingId}-door`;
  const width = Math.max(4, c.parameters.roadWidth * 0.6),
    links = [
      { from: `${id}-activity`, to: `${id}-entrance`, points: [activity, entrance], width },
      { from: `${id}-activity`, to: doorId, points: [activity, { x: point.x - 9, z: point.z }], width }
    ];
  plan.regions.push({
    id,
    label: "眺望塔基础",
    kind: "teleport",
    outline,
    navigationArea: outline,
    navigationWidth: width,
    navigationLinks: links
  });
  plan.buildings.push({
    id: buildingId,
    regionId: id,
    center: point,
    width: PLANNING_REFERENCE.lookout.widthM,
    depth: PLANNING_REFERENCE.lookout.depthM,
    yaw: 0,
    height,
    baseHeight: ground(point),
    outline: envelope(point, PLANNING_REFERENCE.lookout.widthM, PLANNING_REFERENCE.lookout.depthM, 0)
  });
  plan.places.push({
    id,
    label: "传送眺望点",
    purpose: "在塔顶观察地貌；地面入口接入动线",
    center: point,
    outline: []
  });
  data.modules.push({
    id,
    kind: "teleport",
    outline: [point],
    dependencies: ["land-main", ...plan.mountains.map((m) => m.id), ...plan.waters.map((w) => w.id)],
    requested: { height: c.edits[id]?.height ?? 1 },
    resolved: {
      originX: point.x,
      originZ: point.z,
      height,
      eyeHeight: ground(point) + height + 1.7,
      visibleTargets: site.visible,
      angularSpread: (site.spread * 180) / Math.PI,
      candidates: scored.length
    }
  });
  for (const [portId, ownerId, position, kind] of [
    [`${id}-activity`, id, activity, "landing"],
    [`${id}-entrance`, id, entrance, "entrance"],
    [doorId, buildingId, { x: point.x - 9, z: point.z }, "landing"]
  ] as const)
    data.ports.push({
      id: portId,
      ownerId,
      position,
      kind,
      height: ground(position),
      width: kind === "entrance" ? c.parameters.roadWidth * 1.5 : width,
      surfaceId: "ground"
    });
  for (const link of links)
    data.relations.push({
      id: `${link.to}-access`,
      kind: "connects",
      owners: [id, ...(link.to === doorId ? [buildingId] : [])],
      ports: [link.from, link.to],
      required: true,
      network: "supported"
    });
}
