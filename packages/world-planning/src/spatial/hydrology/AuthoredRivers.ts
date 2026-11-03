import type { IslandPlan } from "../../semantic-study/IslandPlanModel";
import { createPlanningGroundSampler } from "../../semantic-study/WorldPlanningTerrain";
import { ribbonOutline } from "../../semantic-study/WorldRibbon";
import { resolveSeedWorldAuthoredRiverCenterlineV1 } from "@galacean/engine-water/world/SeedWorldAuthoredRiverGeometry";

/** Compile authored river intent into the profiles consumed by terrain, queries and Water. */
export function compileAuthoredRivers(plan: IslandPlan): void {
  const retired = new Set(
    plan.waters.filter((water) => water.systemId === "agent-authored-rivers").map((water) => water.id)
  );
  plan.waters = plan.waters.filter((water) => !retired.has(water.id));
  plan.planning!.profiles = plan.planning!.profiles.filter((profile) => !retired.has(profile.ownerId));
  const rivers = (plan.authoredResources ?? []).filter((resource) => resource.resourceType === "river");
  const compiled = rivers.map(({ resourceId, properties: value }) => {
    const mm = (value: number) => Math.round(value * 1000),
      size = plan.parameters.width;
    const points = resolveSeedWorldAuthoredRiverCenterlineV1(
      {
        startXOffsetMillimetres: mm(value.x),
        startZOffsetMillimetres: mm(value.z),
        headingMilliDegrees: mm(value.headingDegrees),
        lengthMillimetres: mm(value.lengthMetres),
        widthMillimetres: mm(value.widthMetres),
        depthMillimetres: mm(value.depthMetres),
        meanderPermille: mm(value.meander)
      },
      size
    ).map((point) => ({ x: point.x + size / 2, z: point.z + size / 2 }));
    const widths = points.map(() => value.widthMetres),
      outline = ribbonOutline(points, widths, undefined, true);
    if (outline.some((point) => point.x < 0 || point.z < 0 || point.x > size || point.z > plan.parameters.depth))
      throw new RangeError("Authored river extends outside the world");
    return { resourceId, value, points, widths, outline };
  });
  if (!compiled.length) return;
  const ground = createPlanningGroundSampler(plan);
  const existing = plan.planning!.profiles.find(
    (profile) =>
      profile.kind === "water" && plan.waters.some((water) => water.kind === "river" && water.id === profile.ownerId)
  );
  const level = existing?.points[0]?.y ?? Math.min(...compiled.flatMap((river) => river.points.map(ground)));
  for (const { resourceId: id, value, points, widths, outline } of compiled) {
    plan.waters.push({
      id,
      label: value.kind,
      kind: "river",
      systemId: "agent-authored-rivers",
      centerline: points,
      widths,
      outline,
      flowSpeed: value.flowSpeed
    });
    for (const kind of ["water", "bed"] as const)
      plan.planning!.profiles.push({
        id: `${id}:${kind}`,
        ownerId: id,
        kind,
        width: value.widthMetres,
        supportIds: [],
        points: points.map((point) => ({ ...point, y: level - (kind === "bed" ? value.depthMetres : 0) }))
      });
  }
}
