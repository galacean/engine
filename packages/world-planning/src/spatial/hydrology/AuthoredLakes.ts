import type { PlanningLakeResource, PlanningResource } from "../PlanningResources";
import type { IslandPlan, PlanPoint } from "../../semantic-study/IslandPlanModel";
import type { SeedWorldWaterBodyResourceProperties } from "../../agent-adapter/ports/SeedWorldEnginePort";
import { sampleSeedWorldWaterBasinProfileV1 } from "../../runtime/hydrology-v1/SeedWorldTerrainFeatureGeometry.ts";

/** Authored basin fields that define its geometry; the fill datum is intentionally excluded. */
export type AuthoredLakeShape = Pick<
  SeedWorldWaterBodyResourceProperties,
  "kind" | "x" | "z" | "radiusMetres" | "depthMetres" | "shorelineIrregularity" | "seed"
>;

/** Normalized basin profile in the authored property space; zero outside the irregular shore. */
export function authoredLakeProfile(value: AuthoredLakeShape): (point: PlanPoint) => number {
  const mm = (value: number) => Math.round(value * 1000);
  const shape = {
    kind: "radial-water-basin" as const,
    featureKind: value.kind,
    centerXOffsetMillimetres: mm(value.x),
    centerZOffsetMillimetres: mm(value.z),
    radiusMillimetres: mm(value.radiusMetres),
    depthMillimetres: mm(value.depthMetres),
    shorelineIrregularityPermille: mm(value.shorelineIrregularity),
    canonicalWaterLevelMillimetres: 0,
    surfaceLevelOffsetMillimetres: 0,
    seed: value.seed
  };
  return (point) =>
    Math.abs(point.x - value.x) > value.radiusMetres * 1.5 || Math.abs(point.z - value.z) > value.radiusMetres * 1.5
      ? 0
      : sampleSeedWorldWaterBasinProfileV1(shape, point.x * 1000, point.z * 1000);
}

export function planningLakeProfile(resource: PlanningLakeResource): (point: PlanPoint) => number {
  return authoredLakeProfile(resource.properties);
}

/** Footprint support ring: the same `profile > 0` reach that becomes the published lake outline. */
export function authoredLakeOutline(value: AuthoredLakeShape): PlanPoint[] {
  const sample = authoredLakeProfile(value),
    count = Math.max(32, Math.ceil(2 * Math.PI * value.radiusMetres));
  return Array.from({ length: count }, (_, i) => {
    const angle = (i * 2 * Math.PI) / count,
      dx = Math.cos(angle),
      dz = Math.sin(angle);
    let low = 0,
      high = value.radiusMetres * 1.5;
    for (let step = 0; step < 24; step++) {
      const distance = (low + high) / 2;
      if (sample({ x: value.x + dx * distance, z: value.z + dz * distance }) > 0) low = distance;
      else high = distance;
    }
    return { x: value.x + dx * low, z: value.z + dz * low };
  });
}

/** Carve the canonical basin independently of its current fill level. */
export function planningLakeGround(resources: readonly PlanningResource[], base: (point: PlanPoint) => number) {
  const lakes = resources
    .filter((resource) => resource.resourceType === "water-body")
    .map((resource) => ({ value: resource.properties, sample: planningLakeProfile(resource) }));
  if (!lakes.length) return base;
  return (point: PlanPoint) => {
    let height = base(point);
    for (const lake of lakes) {
      const profile = lake.sample(point);
      if (profile > 0)
        height = Math.min(height, lake.value.canonicalWaterLevelMetres - lake.value.depthMetres * profile);
    }
    return height;
  };
}

/** Geometry is rebuilt from intent; no shoreline vertices are persisted. */
export function compileAuthoredLakes(plan: IslandPlan): void {
  const retired = new Set(
    plan.waters.filter((water) => water.systemId === "agent-authored-lakes").map((water) => water.id)
  );
  plan.waters = plan.waters.filter((water) => !retired.has(water.id));
  plan.planning!.profiles = plan.planning!.profiles.filter((profile) => !retired.has(profile.ownerId));
  for (const resource of plan.authoredResources ?? [])
    if (resource.resourceType === "water-body") {
      const { resourceId: id, properties: value } = resource;
      if (value.radiusMetres > Math.hypot(plan.parameters.width, plan.parameters.depth) * 2)
        throw new RangeError("Authored lake extends outside the world");
      const outline = authoredLakeOutline(value);
      if (
        outline.some(
          (point) => point.x < 0 || point.z < 0 || point.x > plan.parameters.width || point.z > plan.parameters.depth
        )
      )
        throw new RangeError("Authored lake extends outside the world");
      plan.waters.push({ id, label: value.kind, kind: "lake", systemId: "agent-authored-lakes", outline });
      plan.planning!.profiles.push({
        id: `${id}:water`,
        ownerId: id,
        kind: "water",
        width: value.radiusMetres * 2,
        supportIds: [],
        points: [{ x: value.x, z: value.z, y: value.waterLevelMetres }]
      });
    }
}
