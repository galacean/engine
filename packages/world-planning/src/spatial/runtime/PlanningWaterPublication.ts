import type { IslandPlan } from "../../semantic-study/IslandPlanModel";
import type { PlanningDocument } from "../PlanningDocument";
import { isPlanningTerrainResource } from "../PlanningResources";
import type { SemanticResult } from "../../semantic-study/WorldPlanningContract";
import type { PublishedPlanningSeedScene } from "./PlanningSeedScenePublication";
import type { PlanningRasterClient } from "../../semantic-study/PlanningRasterClient";
import { planningHeightmap } from "../../semantic-study/PlanningHeightmap";
import { planningAlphamap } from "../../semantic-study/PlanningAlphamap";
import { preparePlanningSeedWorldData } from "./PlanningSeedWorldData";
import { preparePlanningNaturalGroundPopulation } from "./PlanningNaturalVegetation";
import { yieldSeedWorldPreparationTask } from "../../world/SeedWorldPreparationTask";
import { createPlanningWaterQuery } from "./PlanningWaterQueries";
import { sampleSeedWorldHeight, type SeedWorldFields } from "../../runtime/SeedWorldFields.ts";
import { planningPresentedSolids } from "./PlanningPresentedSolids";
import { applyPlanningTreeVariations } from "./PlanningTreeVariations";
import {
  terrainChangedRectangle,
  type PreparedTerrainUpdate
} from "@galacean/engine-terrain/terrain/clipmap/TerrainPreparedUpdate";
import type { SeedWorldAuthoringRuntimeBoundsV1 } from "../../world/SeedWorldAuthoringRuntimeDelta";
import { rockFormationPlacements } from "../../integrations/terrain/rock-formation/Placement";
import { rockGrassExclusions } from "../../integrations/terrain/rock-formation/GrassExclusions";
import type { PlanningSeedWorldData } from "./PlanningSeedWorldData";

function nonSurfaceIntent(document: PlanningDocument, includeAuthoringContent = false): string {
  const value = structuredClone(document);
  value.revision = 0;
  // In local dependent runtime mode, authored vegetation/removals/tree-variations share the
  // same local surface/vegetation transaction as physical terrain resources.
  value.authoredResources = includeAuthoringContent
    ? []
    : (value.authoredResources ?? []).filter((resource) => !isPlanningTerrainResource(resource));
  delete value.waterAuthoringVersion;
  delete value.layoutOverrides;
  delete value.placementState;
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
export function planningSurfacePublicationGate(
  previous: PublishedPlanningSeedScene | undefined,
  before: PlanningDocument,
  after: PlanningDocument,
  result: SemanticResult,
  forceFull = false,
  terrainTransitionDurationSeconds?: number,
  dependentSolids = false
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
  if (nonSurfaceIntent(before, dependentSolids) !== nonSurfaceIntent(after, dependentSolids))
    return "mixed-non-surface-intent";
  const terrainChanged =
    JSON.stringify(before.authoredResources?.filter(isPlanningTerrainResource) ?? []) !==
    JSON.stringify(after.authoredResources?.filter(isPlanningTerrainResource) ?? []);
  // These legacy owners do not participate in the reversible surface transaction unless
  // dependent local grounding is enabled by the caller (e.g. exactPrefabs via applyAuthoringHeightPatch).
  const canGroundExactPrefabsLocally =
    dependentSolids && typeof previous.world?.applyAuthoringHeightPatch === "function";
  if (!dependentSolids && terrainChanged && previous.template) return "template-terrain-owner";
  if (terrainChanged && previous.world?.exactPrefabs?.exactInstances.length && !canGroundExactPrefabsLocally)
    return "exact-prefab-terrain-owner";
  const a = previous.plan,
    b = result.plan;
  // When local dependent publication is disabled, keep the full path for animated terrain transitions.
  if (
    !dependentSolids &&
    terrainTransitionDurationSeconds &&
    !b.buildings.length &&
    !b.fences?.length &&
    !b.courtyards?.length
  )
    return "terrain-transition-requested";
  if (
    !dependentSolids &&
    !previous.data.surfaceIntent?.riverBedCoverage &&
    b.waters.some((water) => water.kind === "river")
  )
    return "new-river-bed-residency";
  if (
    a.parameters.seed !== b.parameters.seed ||
    a.parameters.width !== b.parameters.width ||
    a.parameters.depth !== b.parameters.depth
  )
    return "world-lattice-changed";
  // When local dependent adaptation is enabled (live player/AI intervention on an existing world),
  // downstream owners (buildings/fences/courtyards via masonry.prepareTerrain, farming via refreshTerrain,
  // rocks/bridges via prepareSolids, template via prepareRockGrounding) adapt in-place instead of
  // forcing a full-world genesis rebuild.
  if (!dependentSolids) {
    for (const key of [
      "routes",
      "roadGraph",
      "roadNetwork",
      "bridges",
      "roadApproaches",
      "buildings",
      "rocks",
      "fences",
      "courtyards",
      "farming"
    ] as const)
      if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) return "changed-global-owner:" + key;
    if (
      JSON.stringify(a.landscapes?.filter((item) => item.kind === "rock")) !==
      JSON.stringify(b.landscapes?.filter((item) => item.kind === "rock"))
    )
      return "changed-global-owner:landscape-rocks";
  } else if (previous.world?.exactPrefabs?.exactInstances.length && !canGroundExactPrefabsLocally) {
    return "exact-prefab-terrain-owner";
  }
  // Validate the actual sample lattice after Raster adopts its Worker result,
  // before staging updates. Reading an uncached heightmap here would bake it on the host.
  return undefined;
}
/** Compatibility name for callers of the original water-only gate. */
export const planningWaterPublicationGate = planningSurfacePublicationGate;

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
  // Include changed authored vegetation/removal footprints when mixed with a local terrain/water edit.
  const prevResources = new Map((before.plan.authoredResources ?? []).map((r) => [r.resourceId, r]));
  const nextResources = new Map((plan.authoredResources ?? []).map((r) => [r.resourceId, r]));
  for (const id of new Set([...prevResources.keys(), ...nextResources.keys()])) {
    const a = prevResources.get(id);
    const b = nextResources.get(id);
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    for (const resource of [a, b]) {
      if (!resource) continue;
      const props = resource.properties as { x?: number; z?: number; radiusMetres?: number };
      if (typeof props.x === "number" && typeof props.z === "number") {
        const radius =
          typeof props.radiusMetres === "number" && Number.isFinite(props.radiusMetres) ? props.radiusMetres : 12;
        points.push({ x: props.x - radius, z: props.z - radius }, { x: props.x + radius, z: props.z + radius });
      }
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
  revision = previous.revision + 1,
  dependencies?: {
    prepareSolids(
      data: PlanningSeedWorldData
    ): Promise<{ solids: PublishedPlanningSeedScene["solids"]; update: PreparedTerrainUpdate }>;
    submerged(x: number, y: number, z: number): boolean;
    terrainTransitionDurationSeconds?: number;
    onTerrainTweenFrame?: (fields: SeedWorldFields) => void;
    onTerrainTweenComplete?: () => void;
  }
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
  try {
    await raster.run(plan, true, true, true, previous.world.getSurfaceReliefTuning());
    signal.throwIfAborted();
    mark("rasterWorkerMs");
    const native = raster.takeNativeData(plan);
    if (!native) throw Error("Water-impact native fields were not prepared");
    const bounds = { ...planningWaterImpactBounds(previous, plan) };
    const candidate = preparePlanningSeedWorldData(
      plan,
      { height: planningHeightmap(plan), alpha: planningAlphamap(plan) },
      native
    );
    const data = dependencies
      ? candidate
      : {
          ...candidate,
          plan: {
            ...candidate.plan,
            roads: previous.data.plan.roads,
            roadDistance: previous.data.plan.roadDistance
          }
        };
    const solidsChanged =
      JSON.stringify([
        previous.plan.bridges,
        previous.plan.rocks,
        previous.plan.landscapes?.filter((x) => x.kind === "rock")
      ]) !== JSON.stringify([plan.bridges, plan.rocks, plan.landscapes?.filter((x) => x.kind === "rock")]);
    const replacement = dependencies && solidsChanged ? await dependencies.prepareSolids(data) : undefined;
    if (replacement) updates.push(replacement.update);
    mark("prepareSolidsMs");
    const solids = replacement?.solids ?? previous.solids;
    await yieldSeedWorldPreparationTask();
    signal.throwIfAborted();
    if (replacement) {
      // Geometry may overhang its planning footprint; include actual old/new mesh extents.
      const old = new Map(previous.solids.formations.map((mesh) => [mesh.id, mesh]));
      const next = new Map(solids.formations.map((mesh) => [mesh.id, mesh]));
      for (const id of new Set([...old.keys(), ...next.keys()])) {
        if (old.get(id) === next.get(id)) continue;
        for (const mesh of [old.get(id), next.get(id)])
          if (mesh) {
            const p = mesh.mesh.positions;
            for (let i = 0; i < p.length; i += 3) {
              bounds.minimumX = Math.min(bounds.minimumX, p[i] + mesh.origin[0]);
              bounds.maximumX = Math.max(bounds.maximumX, p[i] + mesh.origin[0]);
              bounds.minimumZ = Math.min(bounds.minimumZ, p[i + 2] + mesh.origin[2]);
              bounds.maximumZ = Math.max(bounds.maximumZ, p[i + 2] + mesh.origin[2]);
            }
          }
      }
    }
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
    for (const key of ["waterMask", "wetness", "habitat", "wetlandWeight", "rockySlopeWeight"] as const) {
      include(previous.data.fields[key], data.fields[key]);
      await yieldSeedWorldPreparationTask();
      signal.throwIfAborted();
    }
    include(previous.data.fields.materialWeights, data.fields.materialWeights, 4);
    for (const density of data.population.detailDensityFields) {
      const old = previous.data.population.detailDensityFields.find((field) => field.category === density.category);
      if (old && density.resolution === resolution && old.resolution === resolution)
        include(old.samples, density.samples);
    }
    mark("nativeFieldsMs");
    await yieldSeedWorldPreparationTask();
    signal.throwIfAborted();
    // Settle any in-flight local height tween to its final canonical state before staging a new
    // TerrainClipmap prepareRegionUpdate so patchEpoch and oldSamples stay strictly consistent.
    previous.world.settleLocalHeightTransition?.();
    updates.push(
      previous.world.prepareWaterTerrain(
        data.fields,
        data.surfaceIntent,
        data.terrainSettings,
        data.terrainNormalSamples,
        raster.takeSurfaceRelief(plan)
      )
    );
    if (
      previous.world.exactPrefabs?.exactInstances.length &&
      typeof previous.world.applyAuthoringHeightPatch === "function"
    ) {
      const previousFields = previous.data.fields;
      updates.push({
        commit: () => previous.world.applyAuthoringHeightPatch(data.fields, bounds),
        rollback: () => previous.world.applyAuthoringHeightPatch(previousFields, bounds),
        finalize() {},
        discard() {}
      });
    }
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
    const prevRiverBed = previous.data.surfaceIntent.riverBedCoverage;
    const nextRiverBed = data.surfaceIntent.riverBedCoverage;
    if (prevRiverBed || nextRiverBed) {
      const length = (nextRiverBed ?? prevRiverBed)!.length;
      const changed = terrainChangedRectangle(
        prevRiverBed ?? new Uint8Array(length),
        nextRiverBed ?? new Uint8Array(length),
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
        signal,
        replacement ? { plan, formations: solids.formations } : undefined
      )
    );
    mark("naturalVegetationMs");
    if (!replacement) updates.push(previous.solids.prepareWaterPlan(plan));
    if (dependencies)
      updates.push(
        previous.world.population.prepareRockGrass(
          rockFormationPlacements(plan, solids.formations),
          rockGrassExclusions(plan, data.fields, dependencies.submerged),
          true
        )
      );
    mark("rockGrassMs");
    if (previous.masonry)
      updates.push(await previous.masonry.prepareTerrain({ data, revision }, signal, replacement?.solids.formations));
    mark("masonryTerrainMs");
    const prevTreeVariations = JSON.stringify(
      (previous.plan.authoredResources ?? []).filter((r) => r.resourceType === "tree-variation")
    );
    const nextTreeVariations = JSON.stringify(
      (plan.authoredResources ?? []).filter((r) => r.resourceType === "tree-variation")
    );
    if (prevTreeVariations !== nextTreeVariations) {
      const oldResources = previous.plan.authoredResources ?? [];
      const newResources = plan.authoredResources ?? [];
      updates.push({
        commit: () => applyPlanningTreeVariations(previous.world.population, newResources),
        rollback: () => applyPlanningTreeVariations(previous.world.population, oldResources),
        finalize() {},
        discard() {}
      });
    }
    const groundTemplateOnFields = (fields: SeedWorldFields) => {
      if (!previous.template || typeof previous.template.prepareRockGrounding !== "function") return;
      try {
        const presented = planningPresentedSolids(solids.sourcePlan ?? plan, fields, data.fields);
        previous.template.prepareRockGrounding(
          presented,
          (x, z) => sampleSeedWorldHeight(fields, x, z),
          solids.formations
        )?.();
      } catch {
        /* Ignore if template runtime was disposed during an in-flight tween. */
      }
    };
    if (previous.template && typeof previous.template.prepareRockGrounding === "function") {
      const prevFields = previous.data.fields;
      updates.push({
        commit: () => groundTemplateOnFields(data.fields),
        rollback: () => groundTemplateOnFields(prevFields),
        finalize() {},
        discard() {}
      });
    }
    if (typeof previous.world.playLocalHeightTransition === "function") {
      const previousFields = previous.data.fields;
      const finalFields = data.fields;
      const vegetation = previous.vegetation;
      const activeSolids = solids;
      const durationSeconds = dependencies?.terrainTransitionDurationSeconds;
      updates.push({
        commit: () =>
          previous.world.playLocalHeightTransition(
            previousFields,
            finalFields,
            bounds,
            durationSeconds,
            (fields) => {
              if (vegetation) {
                try {
                  vegetation.prepareGrounding(fields, undefined, undefined, bounds).commit();
                } catch {
                  /* Ignore if vegetation is disposed or concurrently staging another grounding transaction. */
                }
              }
              if (activeSolids && typeof activeSolids.prepare === "function" && activeSolids.sourcePlan) {
                try {
                  const presented = planningPresentedSolids(activeSolids.sourcePlan, fields, finalFields);
                  activeSolids.prepare(presented).commit();
                } catch {
                  /* Ignore if solids were replaced or disposed during an in-flight tween. */
                }
              }
              groundTemplateOnFields(fields);
              dependencies?.onTerrainTweenFrame?.(fields);
            },
            dependencies?.onTerrainTweenComplete
          ),
        rollback() {},
        finalize() {},
        discard() {}
      });
    } else if (typeof previous.world.playTerrainEditWave === "function") {
      const previousFields = previous.data.fields;
      updates.push({
        commit: () => previous.world.playTerrainEditWave(previousFields, data.fields),
        rollback() {},
        finalize() {},
        discard() {}
      });
    }
    signal.throwIfAborted();
    return {
      data,
      updates,
      bounds,
      timings,
      ...(replacement ? { solids: replacement.solids } : {}),
      preparationMs: performance.now() - started
    };
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
