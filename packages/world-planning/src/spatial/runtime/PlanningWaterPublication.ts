import type { IslandPlan } from "../../semantic-study/IslandPlanModel";
import type { PlanningDocument } from "../PlanningDocument";
import type { SemanticResult } from "../../semantic-study/WorldPlanningContract";
import type { PublishedPlanningSeedScene } from "./PlanningSeedScenePublication";
import type { PlanningRasterClient } from "../../semantic-study/PlanningRasterClient";
import { planningHeightmap } from "../../semantic-study/PlanningHeightmap";
import { planningAlphamap } from "../../semantic-study/PlanningAlphamap";
import { preparePlanningSeedWorldData } from "./PlanningSeedWorldData";
import { preparePlanningNaturalGroundPopulation } from "./PlanningNaturalVegetation";
import { yieldSeedWorldPreparationTask } from "../../world/SeedWorldPreparationTask";
import { createPlanningWaterQuery } from "./PlanningWaterQueries";
import { sampleSeedWorldHeight } from "../../runtime/SeedWorldFields.ts";
import {
  terrainChangedRectangle,
  type PreparedTerrainUpdate
} from "@galacean/engine-terrain/terrain/clipmap/TerrainPreparedUpdate";
import type { SeedWorldAuthoringRuntimeBoundsV1 } from "../../world/SeedWorldAuthoringRuntimeDelta";

function nonWaterIntent(document: PlanningDocument): string {
  const value = structuredClone(document);
  value.revision = 0;
  delete value.waterAuthoringVersion;
  delete value.layoutOverrides;
  delete value.placementState;
  value.authoredResources = (value.authoredResources ?? []).filter(
    (r) => r.resourceType !== "water-body" && r.resourceType !== "river"
  );
  for (const entity of Object.values(value.entities)) {
    delete entity.components.lakes;
    delete entity.components.rivers;
  }
  for (const edit of Object.values(value.passthrough.edits)) {
    delete edit.lakes;
    delete edit.rivers;
  }
  delete value.passthrough.parameters.lakes;
  delete value.passthrough.parameters.rivers;
  return JSON.stringify(value);
}
/** Fail closed before bypassing the full-world owner preparation. */
export function planningWaterPublicationGate(
  previous: PublishedPlanningSeedScene | undefined,
  before: PlanningDocument,
  after: PlanningDocument,
  result: SemanticResult,
  forceFull = false
): string | undefined {
  if (forceFull) return "projection-out-of-sync";
  if (!previous || !previous.vegetation) return "no-current-native-water-base";
  if (previous.masonry?.terrainEditPending) return "masonry-edit-active";
  if (result.waterOverlay?.mode !== "overlay") return "legacy-water-semantics";
  if (
    previous.heightTransition &&
    previous.heightTransition.fields.heightSamples !== previous.data.fields.heightSamples
  )
    return "terrain-transition-active";
  if (nonWaterIntent(before) !== nonWaterIntent(after)) return "mixed-non-water-intent";
  const a = previous.plan,
    b = result.plan;
  if (!previous.data.surfaceIntent?.riverBedCoverage && b.waters.some((water) => water.kind === "river"))
    return "new-river-bed-residency";
  if (
    a.parameters.seed !== b.parameters.seed ||
    a.parameters.width !== b.parameters.width ||
    a.parameters.depth !== b.parameters.depth
  )
    return "world-lattice-changed";
  for (const key of [
    "routes",
    "bridges",
    "roadApproaches",
    "buildings",
    "rocks",
    "fences",
    "courtyards",
    "farming"
  ] as const)
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) return "changed-global-owner:" + key;
  return undefined;
}
/** Keep disjoint changed footprints separate for exact contact queries between raster vertices. */
export function planningChangedWaterAreas(before: IslandPlan, after: IslandPlan): SeedWorldAuthoringRuntimeBoundsV1[] {
  const old = new Map(before.waters.map((water) => [water.id, water]));
  const next = new Map(after.waters.map((water) => [water.id, water]));
  const areas: SeedWorldAuthoringRuntimeBoundsV1[] = [];
  const profiles = (plan: IslandPlan, id: string) =>
    JSON.stringify(plan.planning?.profiles.filter((profile) => profile.kind === "water" && profile.ownerId === id));
  for (const id of new Set([...old.keys(), ...next.keys()]))
    if (JSON.stringify(old.get(id)) !== JSON.stringify(next.get(id)) || profiles(before, id) !== profiles(after, id))
      for (const water of [old.get(id), next.get(id)])
        if (water?.outline.length)
          areas.push({
            minimumX: Math.min(...water.outline.map((p) => p.x)),
            maximumX: Math.max(...water.outline.map((p) => p.x)),
            minimumZ: Math.min(...water.outline.map((p) => p.z)),
            maximumZ: Math.max(...water.outline.map((p) => p.z))
          });
  return areas;
}
/** Determine support from actual previous/next vertices, ecology and water geometry; include deletions. */
export function planningWaterImpactBounds(
  before: PublishedPlanningSeedScene,
  plan: IslandPlan
): SeedWorldAuthoringRuntimeBoundsV1 {
  const height = planningHeightmap(plan),
    old = planningHeightmap(before.plan);
  if (height.resolution !== old.resolution || height.spacingX !== old.spacingX || height.spacingZ !== old.spacingZ)
    throw Error("Water terrain lattice changed");
  const changed = terrainChangedRectangle(old.heights, height.heights, height.resolution, height.resolution);
  const points: { x: number; z: number }[] = changed
    ? [
        { x: (changed.x - 1) * height.spacingX, z: (changed.z - 1) * height.spacingZ },
        { x: (changed.x + changed.width) * height.spacingX, z: (changed.z + changed.height) * height.spacingZ }
      ]
    : [];
  for (const area of planningChangedWaterAreas(before.plan, plan))
    points.push({ x: area.minimumX, z: area.minimumZ }, { x: area.maximumX, z: area.maximumZ });
  for (const key of ["landscapes", "flowerRegions"] as const) {
    const previous = new Map((before.plan[key] ?? []).map((value) => [value.id, value]));
    const next = new Map((plan[key] ?? []).map((value) => [value.id, value]));
    for (const id of new Set([...previous.keys(), ...next.keys()]))
      if (JSON.stringify(previous.get(id)) !== JSON.stringify(next.get(id))) {
        for (const value of [previous.get(id), next.get(id)]) if (value) points.push(...value.outline);
      }
  }
  if (!points.length) return { minimumX: 0, minimumZ: 0, maximumX: 0, maximumZ: 0 };
  // Cell clipping supplies its own lattice halo; the height rectangle above includes interpolation neighbours.
  return {
    minimumX: Math.max(
      0,
      points.reduce((n, p) => Math.min(n, p.x), Infinity)
    ),
    minimumZ: Math.max(
      0,
      points.reduce((n, p) => Math.min(n, p.z), Infinity)
    ),
    maximumX: Math.min(
      plan.parameters.width,
      points.reduce((n, p) => Math.max(n, p.x), -Infinity)
    ),
    maximumZ: Math.min(
      plan.parameters.depth,
      points.reduce((n, p) => Math.max(n, p.z), -Infinity)
    )
  };
}
export async function preparePlanningWaterImpact(
  previous: PublishedPlanningSeedScene,
  result: SemanticResult,
  raster: PlanningRasterClient,
  signal: AbortSignal,
  grassDensity: number,
  revision = previous.revision + 1
) {
  const started = performance.now(),
    plan = result.plan,
    updates: PreparedTerrainUpdate[] = [];
  const timings: Record<string, number> = {};
  let checkpoint = started;
  const mark = (name: string) => {
    const now = performance.now();
    timings[name] = now - checkpoint;
    checkpoint = now;
  };
  const bounds = { ...planningWaterImpactBounds(previous, plan) };
  try {
    await raster.run(plan, true, true, true);
    signal.throwIfAborted();
    mark("rasterWorkerMs");
    const native = raster.takeNativeData(plan);
    if (!native) throw Error("Water-impact native fields were not prepared");
    const candidate = preparePlanningSeedWorldData(
      plan,
      { height: planningHeightmap(plan), alpha: planningAlphamap(plan) },
      native
    );
    const data = {
      ...candidate,
      plan: {
        ...candidate.plan,
        roads: previous.data.plan.roads,
        roadDistance: previous.data.plan.roadDistance,
        pois: previous.data.plan.pois,
        summits: previous.data.plan.summits
      }
    };
    // Habitat/distance propagation can extend beyond the edited shoreline. Include exact changed ecology texels.
    const resolution = data.fields.surfaceResolution;
    const include = (before: ArrayLike<number>, after: ArrayLike<number>, channels = 1) => {
      const rectangle = terrainChangedRectangle(before, after, resolution, resolution, channels);
      if (!rectangle) return;
      const step = data.fields.sizeMetres / (resolution - 1);
      bounds.minimumX = Math.min(bounds.minimumX, Math.max(0, (rectangle.x - 1) * step));
      bounds.minimumZ = Math.min(bounds.minimumZ, Math.max(0, (rectangle.z - 1) * step));
      bounds.maximumX = Math.max(
        bounds.maximumX,
        Math.min(plan.parameters.width, (rectangle.x + rectangle.width) * step)
      );
      bounds.maximumZ = Math.max(
        bounds.maximumZ,
        Math.min(plan.parameters.depth, (rectangle.z + rectangle.height) * step)
      );
    };
    for (const key of ["waterMask", "wetness", "habitat", "wetlandWeight", "rockySlopeWeight"] as const)
      include(previous.data.fields[key], data.fields[key]);
    include(previous.data.fields.materialWeights, data.fields.materialWeights, 4);
    for (const density of data.population.detailDensityFields) {
      const old = previous.data.population.detailDensityFields.find((field) => field.category === density.category);
      if (old && density.resolution === resolution && old.resolution === resolution)
        include(old.samples, density.samples);
    }
    mark("nativeFieldsMs");
    updates.push(
      previous.world.prepareWaterTerrain(
        data.fields,
        data.surfaceIntent,
        data.terrainSettings,
        data.terrainNormalSamples
      )
    );
    mark("terrainAtlasReliefMs");
    await yieldSeedWorldPreparationTask();
    signal.throwIfAborted();
    const population = await preparePlanningNaturalGroundPopulation(
      data.population,
      grassDensity,
      plan,
      previous.vegetation!.plantAssets,
      signal,
      previous.data.population
    );
    const query = createPlanningWaterQuery(plan, (p) => sampleSeedWorldHeight(data.fields, p.x, p.z) ?? 0);
    const waterAreas = planningChangedWaterAreas(previous.plan, plan);
    if (previous.data.surfaceIntent.riverBedCoverage && data.surfaceIntent.riverBedCoverage) {
      const changed = terrainChangedRectangle(
        previous.data.surfaceIntent.riverBedCoverage,
        data.surfaceIntent.riverBedCoverage,
        resolution,
        resolution
      );
      if (changed) {
        const step = data.fields.sizeMetres / (resolution - 1);
        waterAreas.push({
          minimumX: (changed.x - 1) * step,
          minimumZ: (changed.z - 1) * step,
          maximumX: (changed.x + changed.width) * step,
          maximumZ: (changed.z + changed.height) * step
        });
      }
    }
    updates.push(
      await previous.world.population.prepareWaterImpact(
        data.fields,
        population,
        bounds,
        signal,
        (x, z) => query(x, z).water,
        previous.world.waterGrassCoverage(data.fields, data.surfaceIntent),
        waterAreas
      )
    );
    mark("groundPopulationMs");
    updates.push(
      await previous.vegetation!.prepareWaterImpact(
        plan,
        planningHeightmap(plan),
        data.fields,
        data.population,
        bounds,
        signal
      )
    );
    mark("naturalVegetationMs");
    updates.push(previous.solids.prepareWaterPlan(plan));
    if (previous.masonry) updates.push(await previous.masonry.prepareTerrain({ data, revision }, signal));
    signal.throwIfAborted();
    return { data, updates, bounds, timings, preparationMs: performance.now() - started };
  } catch (error) {
    const failures: unknown[] = [error];
    for (const update of updates.reverse()) {
      try {
        update.discard();
      } catch (failure) {
        failures.push(failure);
      }
    }
    if (failures.length > 1) throw new AggregateError(failures, "Water impact preparation cleanup failed");
    throw error;
  }
}
