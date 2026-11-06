import type { IslandPlan } from "../../semantic-study/IslandPlanModel";
import { createPlanningRingQuery, profileHeight } from "../../semantic-study/WorldPlanningTerrain";
import type { SeedWorldAuthoredWaterQueryResultV1 } from "@galacean/engine-water/world/SeedWorldAuthoredWaterQuery";

/** Water habitat and draft point queries use current water elevation over the canonical bed. */
export function createPlanningWaterQuery(plan: IslandPlan, sampleGround: (point: { x: number; z: number }) => number) {
  const lands = [plan.land, ...plan.islands].map(createPlanningRingQuery);
  const dry = new Set(
    (plan.authoredResources ?? []).flatMap((resource) =>
      resource.resourceType === "water-body" &&
      resource.properties.waterLevelMetres <= resource.properties.minimumWaterLevelMetres
        ? [resource.resourceId]
        : []
    )
  );
  const waters = plan.waters.flatMap((water) => {
    if (dry.has(water.id)) return [];
    const profile = plan.planning?.profiles.find((profile) => profile.ownerId === water.id && profile.kind === "water");
    return profile
      ? [
          {
            id: water.id,
            profile,
            ring: createPlanningRingQuery(water.outline),
            holes: (water.lake?.holes ?? []).map(createPlanningRingQuery)
          }
        ]
      : [];
  });
  return (x: number, z: number): SeedWorldAuthoredWaterQueryResultV1 => {
    if (x < 0 || z < 0 || x > plan.parameters.width || z > plan.parameters.depth) return { water: false };
    const point = { x, z },
      ground = sampleGround(point);
    let candidate: { id: string; surface: number } | undefined;
    for (const water of waters) {
      if (!water.ring.inside(point) || water.holes.some((hole) => hole.inside(point))) continue;
      const surface = profileHeight(point, water.profile);
      if (surface > ground && (!candidate || surface > candidate.surface)) candidate = { id: water.id, surface };
    }
    if (!candidate && ground < 0 && !lands.some((land) => land.inside(point)))
      candidate = { id: "planning-ocean", surface: 0 };
    return candidate
      ? { water: true, bodyId: candidate.id, surfaceElevationMetres: candidate.surface }
      : { water: false };
  };
}

/** Pure water catalog for an accepted planning result, including unpublished draft bodies. */
export function planningWaterRegions(
  plan: IslandPlan,
  kind: "ocean" | "river" | "lake",
  limit: number,
  activeIds?: ReadonlySet<string>
) {
  if (limit <= 0) return { kind, features: [] };
  if (kind === "ocean")
    return {
      kind,
      features:
        activeIds && !activeIds.has("planning-ocean")
          ? []
          : [
              {
                id: "planning-ocean",
                position: [plan.parameters.width / 2, 0, plan.parameters.depth / 2],
                surfaceElevationMetres: 0,
                bounds: { minimum: [0, 0, 0], maximum: [plan.parameters.width, 0, plan.parameters.depth] }
              }
            ]
    };
  return {
    kind,
    features: plan.waters
      .filter((water) => water.kind === kind && (!activeIds || activeIds.has(water.id)))
      .slice(0, limit)
      .map((water) => {
        const profile = plan.planning?.profiles.find(
          (profile) => profile.ownerId === water.id && profile.kind === "water"
        );
        if (!profile?.points.length) throw new Error(`Water ${water.id} has no surface profile`);
        const points = profile.points,
          first = points[0],
          middle = points[Math.floor(points.length / 2)],
          last = points.at(-1)!;
        let minY = Infinity,
          maxY = -Infinity;
        for (const point of points) {
          minY = Math.min(minY, point.y);
          maxY = Math.max(maxY, point.y);
        }
        return {
          id: water.id,
          pointCount: points.length,
          middle: [middle.x, middle.y, middle.z],
          source: [first.x, first.y, first.z],
          outlet: [last.x, last.y, last.z],
          surfacePosition: [middle.x, middle.y, middle.z],
          surfaceElevationMetres: middle.y,
          maximumWidthMetres: Math.max(profile.width, ...(water.widths ?? [])),
          bounds: {
            minimum: [Math.min(...water.outline.map((p) => p.x)), minY, Math.min(...water.outline.map((p) => p.z))],
            maximum: [Math.max(...water.outline.map((p) => p.x)), maxY, Math.max(...water.outline.map((p) => p.z))]
          }
        };
      })
  };
}
