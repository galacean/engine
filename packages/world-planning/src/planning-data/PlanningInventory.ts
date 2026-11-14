import { WAYFINDING_PROFILE } from "./WayfindingModel";
import { SETTLEMENT_PROFILE as settlementProfile } from "./SettlementProfile";
import units from "./semantic-units.json";
import { PLANNING_REFERENCE } from "./PlanningReference";
import type { IslandPlan, PlanPoint } from "../semantic-study/IslandPlanModel";

/** Semantic vocabulary shared with future measured-asset importers. IDs are independent of labels. */
export const SEMANTIC_UNITS = units;
const area = (ring: PlanPoint[]) =>
  Math.abs(
    ring.reduce((sum, p, i) => {
      const q = ring[(i + 1) % ring.length];
      return sum + p.x * q.z - q.x * p.z;
    }, 0)
  ) / 2;
const length = (points: PlanPoint[]) =>
  points.reduce((sum, p, i) => (i ? sum + Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z) : sum), 0);

/** Export actual plan measurements alongside the reference that produced them.
 * Region area is a polygon measurement; no invented building-height or OBB is assigned to it.
 * Settlement measurements carry their measured reference and derived policy separately.
 */
export function planningInventory(plan: IslandPlan, profile = PLANNING_REFERENCE) {
  const records: Record<string, unknown>[] = [];
  for (const b of plan.buildings)
    records.push({
      id: b.id,
      unit: b.regionId === "teleport-0" ? "lookout" : "building",
      parentId: b.regionId,
      position: b.center,
      widthM: b.width,
      depthM: b.depth,
      heightM: b.height,
      floorCount: b.floorCount,
      floorHeightsM: b.floorHeightsM,
      doorWidthM: b.doorWidthM,
      doorHeightM: b.doorHeightM,
      footprintM2: b.width * b.depth,
      yawRadians: b.yaw
    });
  for (const r of plan.rocks)
    records.push({
      id: r.id,
      unit: `rock.${r.role}`,
      parentId: r.groupId,
      position: r.center,
      widthM: r.width,
      depthM: r.depth,
      heightM: r.height,
      obbAreaM2: r.width * r.depth,
      yawRadians: r.yaw
    });
  for (const r of plan.regions) {
    const members = plan.buildings.filter((b) => b.regionId === r.id),
      a = area(r.outline);
    records.push({
      id: r.id,
      unit: r.kind === "village" ? "village" : r.kind === "teleport" ? "lookout" : r.kind,
      areaM2: a,
      footprintCoverage: members.reduce((s, b) => s + b.width * b.depth, 0) / a,
      floorAreaRatio: members.reduce((s, b) => s + b.width * b.depth * (b.floorCount ?? 1), 0) / a
    });
  }
  for (const m of plan.mountains)
    records.push({
      id: m.id,
      unit: m.semanticKind ?? "mountain",
      children: m.rockIds,
      areaM2: (m.outlines ?? [m.outline]).reduce((sum, r) => sum + area(r), 0)
    });
  for (const c of plan.courtyards ?? []) {
    records.push({
      id: c.id,
      unit: "courtyard",
      parentId: c.regionId,
      buildingId: c.buildingId,
      areaM2: area(c.outline)
    });
    records.push({ id: c.id + "-gate", unit: "gate", parentId: c.id, position: c.gate, widthM: c.gateWidth });
    records.push({
      id: c.path.id,
      unit: "yard-path",
      parentId: c.id,
      lengthM: length(c.path.points),
      widthM: c.path.width
    });
    for (const f of c.fences)
      records.push({
        id: f.id,
        unit: "fence",
        parentId: c.id,
        widthM: f.sizeX,
        depthM: f.sizeZ,
        heightM: f.sizeY,
        yawRadians: f.yaw
      });
  }
  for (const item of plan.landscapes ?? [])
    records.push({
      id: item.id,
      unit: "landscape." + item.kind,
      parentId: item.ownerId,
      sourceId: item.sourceId,
      position: item.center,
      widthM: item.width,
      depthM: item.depth,
      heightM: item.height,
      yawRadians: item.yaw,
      collisionRadiusM: item.collisionRadius,
      canopyRadiusM: item.canopyRadius
    });
  for (const f of plan.fences ?? [])
    records.push({
      id: f.id,
      unit: "fence",
      position: f.center,
      widthM: f.sizeX,
      depthM: f.sizeZ,
      heightM: f.sizeY,
      yawRadians: f.yaw
    });
  for (const plaza of plan.plazas ?? [])
    records.push({ id: plaza.id, unit: "plaza", position: plaza.center, areaM2: area(plaza.outline) });
  for (const r of plan.routes) {
    const l = length(r.points);
    records.push({
      id: r.id,
      unit: "road",
      from: r.from,
      to: r.to,
      lengthM: l,
      widthM: r.width,
      widthRangeM: r.widths?.length ? [Math.min(...r.widths), Math.max(...r.widths)] : [r.width, r.width],
      outline: r.outline,
      walkSeconds: l / profile.actor.walkMps,
      runSeconds: l / profile.actor.runMps
    });
  }
  for (const b of plan.bridges)
    records.push({ id: b.id, unit: "bridge", lengthM: length([b.a, b.b]), widthM: b.width, waterId: b.riverId });
  for (const w of plan.waters) records.push({ id: w.id, unit: "water", kind: w.kind, areaM2: area(w.outline) });
  for (const port of plan.planning?.ports ?? [])
    records.push({
      id: port.id,
      unit: port.id.endsWith("-door")
        ? "door"
        : port.kind === "entrance"
          ? "entrance"
          : port.kind === "water"
            ? "water-port"
            : port.kind === "summit"
              ? "summit"
              : "junction",
      parentId: port.ownerId,
      position: port.position,
      elevationM: port.height,
      widthM: port.width
    });
  for (const sight of plan.sights)
    records.push({
      id: sight.id,
      unit: "sightline",
      from: sight.from,
      to: sight.to,
      targetId: sight.targetId,
      status: sight.status ?? "unknown"
    });
  for (const structure of plan.structures ?? [])
    if (structure.waterDomain)
      records.push({
        id: structure.waterDomain.id,
        unit: "water-domain",
        parentId: structure.id,
        areaM2: area(structure.waterDomain.outline)
      });
  records.push({ id: "land", unit: "land", areaM2: area(plan.land) });
  plan.islands.forEach((ring, i) => records.push({ id: `island-${i}`, unit: "island", areaM2: area(ring) }));
  records.push({ id: "spawn", unit: "spawn", position: plan.spawn });
  return {
    profile: plan.settlementLayout ? settlementProfile : profile,
    actorReference: profile.actor,
    guidanceDesign: WAYFINDING_PROFILE,
    catalog: SEMANTIC_UNITS,
    records
  };
}
