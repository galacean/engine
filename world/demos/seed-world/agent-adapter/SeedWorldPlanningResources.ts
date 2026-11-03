import { resolveSeedWorldTerrainTransitionDurationSeconds } from "@galacean/engine-terrain/world/SeedWorldTerrainTransition";
import type { PlanningSession } from "@galacean/engine-world-planning/spatial/PlanningSession";
import { planningResourceSnapshot, parsePlanningResources } from "@galacean/engine-world-planning/spatial/PlanningResources";
import { planningGroundSurface } from "@galacean/engine-world-planning/semantic-study/PlanningHeightmap";
import { captureAuthoredLakeBasin, planningLakeSpillLevel, resolvePlanningLakeBoundary, type AuthoredLakeBasin } from "@galacean/engine-world-planning/semantic-study/PlanningLakeBasin";
import { planningLakeAssets } from "@galacean/engine-world-planning/semantic-study/PlanningLakeSource";
import { resolveWaterEditOptions, type WaterEditOptions } from "@galacean/engine-world-planning/spatial/hydrology/PlanningWaterEdits";
import { compileAuthoredVegetation } from "@galacean/engine-world-planning/spatial/ecology/AuthoredVegetation";
import { planningSpatialSnapshotReader } from "../src/planning/spatial/runtime/PlanningSpatialQueries.ts";
import { planningSolidObjects } from "../src/planning/spatial/runtime/PlanningObjectCatalog.ts";
import { treeVariationKey } from "@galacean/engine-vegetation/world/SeedWorldTreeShapeControls";
import { defaultPlanningWaterColor } from "@galacean/engine-world-planning/spatial/runtime/PlanningWaterColors";
import { validateSeedWorldWaterColor } from "@galacean/engine-water/world/SeedWorldWaterColor";
import type { SeedWorldEnginePort, SeedWorldResourceMutation, SeedWorldObject, SeedWorldAuthoringResource,
  SeedWorldWaterBodyResourceProperties } from "@galacean/engine-world-planning/agent-adapter/ports/SeedWorldEnginePort";
import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import type { SeedWorldAssetCandidate } from "@galacean/engine-world-planning/agent-adapter/SeedWorldAssetManager";

/** Planning-owned projection keeps native assets coherent with unpublished author edits. */
export interface PlanningResourcePortOptions {
  nativeCatalog?(plan: IslandPlan, revision: number): { assets: readonly SeedWorldAssetCandidate[]; objects: readonly SeedWorldObject[] } | undefined;
}

/** Adapter only: all accepted mutations belong to the supplied PlanningSession. */
export function createPlanningResourcePort(base: SeedWorldEnginePort, session: PlanningSession, executionId: string,
  options: PlanningResourcePortOptions = {}): SeedWorldEnginePort {
  let serial = 0;
  let nativeResult: PlanningSession["result"], nativeCatalog: ReturnType<NonNullable<PlanningResourcePortOptions["nativeCatalog"]>>;
  const readNative = () => {
    if (!session.result || !options.nativeCatalog) return undefined;
    if (nativeResult !== session.result || !nativeCatalog) {
      nativeCatalog = options.nativeCatalog(session.result.plan, session.document.revision);
      nativeResult = session.result;
    }
    return nativeCatalog;
  };
  let treeProjection: { document: PlanningSession["document"]; result: PlanningSession["result"]; objects: readonly SeedWorldObject[] } | undefined;
  const readSpatial = planningSpatialSnapshotReader(session);
  const spatial = base.createSpatialQueryPort?.(readSpatial, () => session.document.revision);
  const snapshot = () => planningResourceSnapshot(session.document);
  const mutate = async (mutations: readonly Readonly<SeedWorldResourceMutation>[], signal: AbortSignal, edit?: WaterEditOptions) => {
    signal.throwIfAborted();
    const durations = mutations.flatMap(mutation => mutation.resourceType === "terrain-feature" && mutation.action !== "delete"
      ? [resolveSeedWorldTerrainTransitionDurationSeconds(mutation.transitionDurationSeconds)] : []);
    const duration = durations.length ? Math.max(...durations) : undefined;
    const document = session.export();
    // Only a proven-compatible loaded world may opt into the new author semantics on a real edit.
    if (session.result?.waterOverlay?.mode === "overlay" && mutations.some(mutation =>
      mutation.resourceType === "water-body" || mutation.resourceType === "river")) document.waterAuthoringVersion = 1;
    let resources = document.authoredResources ??= [];
    const results: { action: string; resourceType: string; resourceId: string; resource?: SeedWorldAuthoringResource; realizedPlantCount?: number }[] = [];
    const physicalIds = new Set<string>();
    for (const mutation of mutations) {
      let basin: AuthoredLakeBasin | undefined;
      if (mutation.resourceType === "tree-variation") {
        const { recipeId, variationIndex, controls } = mutation.value;
        const resourceId = treeVariationKey(recipeId, variationIndex);
        const previous = resources.find(resource => resource.resourceType === "tree-variation" && resource.resourceId === resourceId);
        const merged = { ...(previous?.resourceType === "tree-variation" ? previous.properties.controls : {}), ...controls };
        if (!overrides.previewTreeVariationEdit) throw new Error("Tree variation preview is unavailable");
        overrides.previewTreeVariationEdit(recipeId, variationIndex, merged);
        resources = parsePlanningResources([...resources.filter(resource => resource.resourceId !== resourceId),
          { resourceType: "tree-variation", resourceId, properties: { recipeId, variationIndex, controls: merged } }]);
        document.authoredResources = resources;
        results.push({ action: "update", resourceType: "tree-variation", resourceId });
        continue;
      }
      if (mutation.resourceType === "object-removal") {
        if (mutation.value.objectKind !== "tree" && mutation.value.objectKind !== "shrub"
          && !planningSolidObjects(session.result!.plan, session.document.revision).some(object => object.objectId === mutation.value.objectId))
          throw new Error("Object has no planning removal consumer");
        const object = objects().find(object => object.objectId === mutation.value.objectId);
        if (!object || object.objectKind !== mutation.value.objectKind || beforeRemoval(document, mutation.value.objectId))
          throw new Error("Object removal target changed or no longer exists");
      }
      const before = planningResourceSnapshot(document);
      const existing = mutation.action === "create" ? undefined : before.resources.find(resource => resource.resourceId === mutation.resourceId);
      if (mutation.action !== "create" && (!existing || existing.resourceType !== mutation.resourceType || existing.contentHash !== mutation.expectedContentHash))
        throw new Error("Planning resource changed or no longer exists");
      const resourceId = mutation.action === "create" ? `agent-${crypto.randomUUID()}` : mutation.resourceId;
      if (mutation.action === "create") {
        let properties: unknown = structuredClone(mutation.value);
        if (mutation.resourceType === "water-body") {
          // The pool surface is the basin spill point so the shoreline necessarily closes.
          resolveWaterEditOptions(edit, true);
          basin = captureAuthoredLakeBasin({ ...session.result!.plan, authoredResources: resources }, resourceId, mutation.value);
          const level = planningLakeSpillLevel(session.result!.plan, resourceId, mutation.value, basin);
          properties = { ...mutation.value, canonicalWaterLevelMetres: level, waterLevelMetres: level,
            minimumWaterLevelMetres: level - mutation.value.depthMetres, maximumWaterLevelMetres: level };
        }
        resources = parsePlanningResources([...resources, { resourceType: mutation.resourceType, resourceId, properties }]);
      }
      else {
        const index = resources.findIndex(resource => resource.resourceId === resourceId);
        if (mutation.action === "delete") resources.splice(index, 1);
        else resources = parsePlanningResources(resources.map((resource, i) => {
          if (i !== index) return resource;
          const properties = { ...resource.properties, ...structuredClone(mutation.patch) };
          if (resource.resourceType === "water-body") {
            const waterProperties = properties as SeedWorldWaterBodyResourceProperties;
            // Geometry edits move the spill point; re-derive the basin datum and keep fill inside it.
            const geometryChanged = resource.properties.radiusMetres !== waterProperties.radiusMetres
              || resource.properties.shorelineIrregularity !== waterProperties.shorelineIrregularity
              || resource.properties.seed !== waterProperties.seed;
            resolveWaterEditOptions(edit, geometryChanged || resource.properties.depthMetres !== waterProperties.depthMetres);
            if (geometryChanged) {
              basin = captureAuthoredLakeBasin({ ...session.result!.plan, authoredResources: resources }, resourceId, waterProperties);
              const level = planningLakeSpillLevel(session.result!.plan, resourceId, waterProperties, basin);
              Object.assign(waterProperties, { canonicalWaterLevelMetres: level, maximumWaterLevelMetres: level,
                minimumWaterLevelMetres: level - waterProperties.depthMetres,
                waterLevelMetres: Math.min(level, Math.max(level - waterProperties.depthMetres, waterProperties.waterLevelMetres ?? level)) });
            }
            else Object.assign(waterProperties, {
              minimumWaterLevelMetres: resource.properties.canonicalWaterLevelMetres - waterProperties.depthMetres
            });
          }
          return { ...resource, properties };
        }));
      }
      document.authoredResources = resources;
      const resource = mutation.action === "delete" ? existing! : planningResourceSnapshot(document).resources.find(resource => resource.resourceId === resourceId)!;
      if (mutation.action !== "delete" && resource.resourceType === "water-body") {
        const physical = (value: typeof resource.properties) => ({ ...value, colorRgb: undefined });
        if (existing?.resourceType !== "water-body" || JSON.stringify(physical(existing.properties)) !== JSON.stringify(physical(resource.properties))) {
          physicalIds.add(resourceId);
          const fillOnly = existing?.resourceType === "water-body" && JSON.stringify({ ...existing.properties, colorRgb: undefined, waterLevelMetres: undefined })
            === JSON.stringify({ ...resource.properties, colorRgb: undefined, waterLevelMetres: undefined });
          if (!fillOnly) assertPlanningLakeBasinCloses({ ...session.result!.plan, authoredResources: resources }, resourceId, resource.properties, basin);
        }
      }
      const world = base.readWorldState()!.world;
      for (const resource of resources) {
        if (resource.resourceType === "tree-variation" || resource.resourceType === "object-removal" ||
          (resource.resourceType === "vegetation-brush" && resource.properties.distributionKind === "single" &&
            ["tree", "shrub"].includes(resource.properties.category))) continue;
        const { properties } = resource;
        if (properties.x < 0 || properties.z < 0 || properties.x > world.sizeMetres || properties.z > world.sizeMetres)
          throw new Error("Authored resource is outside the world");
      }
      results.push({ action: mutation.action, resourceType: mutation.resourceType, resourceId, resource });
    }
    // Validate the complete candidate before accepting any author state. In particular, a water
    // edit and a plant edit in one batch must use the same resulting terrain and water mask.
    let realized = results;
    const receipt = await session.load(document, signal, duration, edit, (candidateDocument, candidateResult) => {
      // Validate on the final solved candidate, including all resources in the batch.
      // Simple fill was already validated against the accepted bed; colour does no geometry work.
      if (!candidateResult.waterUpdate && physicalIds.size) {
        try { planningLakeAssets(candidateResult.plan, physicalIds); }
        catch (error) { throw new Error(`Water basin does not close on the terrain here. ${String(error)}`); }
      }
      if (!results.some(result => result.resource?.resourceType === "vegetation-brush")) return;
      const readPopulation = planningSpatialSnapshotReader({ result: candidateResult });
      const atomic = compileAuthoredVegetation((candidateDocument.authoredResources ?? []).filter(resource =>
        resource.resourceType === "object-removal" || (resource.resourceType === "vegetation-brush" &&
          resource.properties.distributionKind === "single")), candidateResult.plan.parameters.width,
        candidateResult.plan.parameters.seed);
      realized = results.map(result => ({ ...result,
        ...(result.resource?.resourceType === "vegetation-brush" && ["tree", "shrub"].includes(result.resource.properties.category)
          ? { realizedPlantCount: (result.resource.properties.distributionKind === "single" ? atomic : readPopulation().population.treeInstances)
            .filter(instance => instance.authoringBrushId === result.resourceId).length } : {}) }));
    });
    if (receipt.status !== "accepted") throw new Error(receipt.message ?? "Planning resource mutation was rejected");
    return { transactionId: `${executionId}:resources:${++serial}`, action: "batch", results: realized, authoring: snapshot() };
  };
  const objects = (treePatch?: { recipeId: string; effectIndex: number; controls: import("@galacean/engine-vegetation/world/SeedWorldTreeShapeControls").SeedWorldTreeShapePatch }): SeedWorldObject[] => {
    const live = base.readWorldState();
    if (!live || !session.result) throw new Error("Planning world is not ready");
    const published = base.queryWorldObjects({ kinds: ["tree", "shrub", "rock", "small-rock", "mushroom", "lotus"], orderBy: [], limit: Number.MAX_SAFE_INTEGER }).objects;
    const solids = planningSolidObjects(session.result.plan, session.document.revision);
    // Membership belongs to the producer, not the intersection of old/new IDs.
    // Replanning may retire or introduce solids before the live scene publishes.
    const nativeProjection = readNative();
    const native = nativeProjection !== undefined || base.readVegetationAssets?.() !== undefined;
    const natural = nativeProjection
      ? [...published.filter(object => object.source.kind !== "authoring" && object.catalogOwner !== "planning"),
          ...nativeProjection.objects.filter(object => object.source.kind !== "authoring")]
      : published.filter(object => object.source.kind !== "authoring" && (object.catalogOwner !== "planning" ||
          (native && (object.objectKind === "tree" || object.objectKind === "shrub"))));
    const liveResources = new Map(base.readAuthoringSnapshot().resources.map(resource => [resource.resourceId, resource.contentHash]));
    const unchanged = new Set(snapshot().resources.filter(resource => liveResources.get(resource.resourceId) === resource.contentHash).map(resource => resource.resourceId));
    const publishedById = new Map(published.map(object => [object.objectId, object]));
    let ground: ReturnType<typeof planningGroundSurface>["sample"] | undefined;
    const resources = session.document.authoredResources ?? [];
    const hasAreaPlants = resources.some(resource => resource.resourceType === "vegetation-brush" &&
      ["tree", "shrub"].includes(resource.properties.category) && resource.properties.distributionKind !== "single");
    const authoredInstances = nativeProjection ? [] : hasAreaPlants ? readSpatial().population.treeInstances :
      compileAuthoredVegetation(resources, live.world.sizeMetres, session.result.plan.parameters.seed);
    const authored = nativeProjection?.objects.filter(object => object.source.kind === "authoring") ??
      authoredInstances.filter(instance => instance.authoringBrushId).map(instance => {
      const x = instance.normalizedPosition.x * live.world.sizeMetres, z = instance.normalizedPosition.y * live.world.sizeMetres;
      const accepted = unchanged.has(instance.authoringBrushId!) ? publishedById.get(instance.id) : undefined;
      if (accepted) return { ...accepted, worldRevision: session.document.revision };
      return { worldId: `seed-world-${live.world.rootSeed}`, worldRevision: session.document.revision,
        objectId: instance.id, objectKind: instance.category as "tree" | "shrub",
        position: [x, (ground ??= planningGroundSurface(session.result!.plan).sample)({ x, z }), z] as const, footprintMetres: instance.footprintMetres,
        source: { kind: "authoring" as const, sourceId: instance.authoringBrushId! },
        properties: { prototypeFamily: instance.prototypeFamily, assetRecipeId: instance.assetRecipeId,
          treeSpeciesProfileKey: instance.treeSpeciesProfileKey, scale: instance.scale, yawRadians: instance.yawRadians }
      };
    });
    const removed = new Set(snapshot().removedObjectIds);
    const projectTrees = () => !native ? base.projectPlanningTrees?.(readSpatial().population.treeInstances,
      (x, z) => (ground ??= planningGroundSurface(session.result!.plan).sample)({ x, z }), live.world.sizeMetres, session.document.revision,
      (recipeId, effectIndex) => {
        const resource = session.document.authoredResources?.find(resource => resource.resourceType === "tree-variation"
          && resource.properties.recipeId === recipeId && resource.properties.variationIndex + 1 === effectIndex);
        const saved = resource?.resourceType === "tree-variation" ? resource.properties.controls : undefined;
        return treePatch?.recipeId === recipeId && treePatch.effectIndex === effectIndex ? { ...saved, ...treePatch.controls } : saved;
      }) : undefined;
    let projectedTrees: readonly SeedWorldObject[] | undefined;
    if (treePatch) projectedTrees = projectTrees();
    else if (treeProjection?.document === session.document && treeProjection.result === session.result) projectedTrees = treeProjection.objects;
    else {
      projectedTrees = projectTrees();
      if (projectedTrees) treeProjection = { document: session.document, result: session.result, objects: projectedTrees };
    }
    const catalog = [...natural, ...solids, ...authored].filter(object => !projectedTrees || object.objectKind !== "tree");
    if (projectedTrees) catalog.push(...projectedTrees);
    return catalog.filter(object => !removed.has(object.objectId)).map(object => {
      if (projectedTrees && object.objectKind === "tree") return object;
      if (object.objectKind === "tree" || object.objectKind === "shrub") {
        const [x, previousY, z] = object.position;
        const y = (ground ??= planningGroundSurface(session.result!.plan).sample)({ x, z });
        const bounds = object.properties.bounds as { minimum: readonly [number, number, number]; maximum: readonly [number, number, number] } | undefined;
        const translate = (point: readonly [number, number, number]) => [point[0], y + (point[1] - previousY), point[2]] as const;
        object = { ...object, position: [x, y, z], worldRevision: session.document.revision,
          properties: { ...object.properties, ...(bounds ? { bounds: { minimum: translate(bounds.minimum), maximum: translate(bounds.maximum) } } : {}) } };
      }
      const edit = session.document.authoredResources?.find(resource => resource.resourceType === "tree-variation"
        && resource.properties.recipeId === object.properties.treeRecipeId
        && resource.properties.variationIndex + 1 === object.properties.treeEffectIndex);
      if (edit?.resourceType !== "tree-variation") return object;
      if (!base.projectTreeVariationObject) throw new Error("Tree variation projection is unavailable");
      return base.projectTreeVariationObject(object, edit.properties.controls);
    });
  };
  const overrides: Partial<SeedWorldEnginePort> = {
    ...spatial,
    readVegetationAssets: () => readNative()?.assets ?? base.readVegetationAssets?.(),
    resolveSpatialTarget: target => {
      if (target.anchor.kind !== "position" || target.relation.kind !== "at")
        return (spatial?.resolveSpatialTarget ?? base.resolveSpatialTarget.bind(base))(target);
      const { x, z } = target.anchor;
      if (![x, z].every(Number.isFinite)) throw new Error("Spatial target requires finite coordinates");
      if (!session.result) throw new Error("Planning world is not ready");
      const y = planningGroundSurface(session.result.plan).sample({ x, z });
      return { geometry: "point", position: [x, y, z], anchor: { kind: "position" }, relation: target.relation,
        worldRevision: session.document.revision };
    },
    readWaterColor: ref => {
      if (ref.source !== "authored") return base.readWaterColor?.(ref);
      const resource = snapshot().resources.find(resource => resource.resourceId === ref.id);
      if (ref.domain !== "water" || !resource || (resource.resourceType !== "river" && resource.resourceType !== "water-body")
        || resource.properties.kind !== ref.kind) return undefined;
      return resource.properties.colorRgb ?? defaultPlanningWaterColor(resource.resourceType);
    },
    updateWaterColor: async (ref, color, signal, edit) => {
      if (ref.source !== "authored") {
        if (!base.updateWaterColor) throw new Error("Water color editing is unavailable");
        return base.updateWaterColor(ref, color, signal, edit);
      }
      validateSeedWorldWaterColor(color);
      const resource = snapshot().resources.find(resource => resource.resourceId === ref.id);
      if (ref.domain !== "water" || !resource || (resource.resourceType !== "river" && resource.resourceType !== "water-body")
        || resource.properties.kind !== ref.kind) throw new Error("Authored water color target no longer exists");
      await mutate([{ action: "update", resourceType: resource.resourceType, resourceId: resource.resourceId,
        expectedContentHash: resource.contentHash, patch: { colorRgb: [...color] } }], signal, edit);
      return [...color];
    },
    previewTreeVariationEdit: base.projectPlanningTrees ? (recipeId, variationIndex, controls) => {
      const current = objects(), next = objects({ recipeId, effectIndex: variationIndex + 1, controls });
      const members = [...current, ...next].filter(object => object.properties.treeRecipeId === recipeId
        && object.properties.treeEffectIndex === variationIndex + 1);
      if (!members.length) throw new Error("Shared tree effect has no current instances");
      const bounds = members.map(object => object.properties.bounds as import("@galacean/engine-world-planning/agent-adapter/ports/SeedWorldEnginePort").SeedWorldBounds);
      return { minimum: [0, 1, 2].map(axis => Math.min(...bounds.map(bound => bound.minimum[axis]))) as [number, number, number],
        maximum: [0, 1, 2].map(axis => Math.max(...bounds.map(bound => bound.maximum[axis]))) as [number, number, number] };
    } : base.previewTreeVariationEdit?.bind(base),
    readAuthoringSnapshot: snapshot,
    validateWorldResources: async (mutations, signal, edit) => {
      signal.throwIfAborted();
      const preview = session.forkAuthoringDraft();
      await createPlanningResourcePort(base, preview, `${executionId}:preview`, options).mutateWorldResources(mutations, signal, edit);
    },
    mutateWorldResource: (mutation, signal, edit) => mutate([mutation], signal, edit), mutateWorldResources: mutate,
    getWorldObject: id => {
      const object = objects().find(object => object.objectId === id);
      if (!object) throw new Error(`World object '${id}' does not exist`);
      return object;
    },
    queryWorldObjects: input => {
      const catalog = objects(), state = base.readWorldState()!;
      const anchor = input.spatial?.anchor;
      const position = anchor?.kind === "viewer" ? state.camera.position : anchor?.kind === "position" ? [anchor.x, 0, anchor.z]
        : anchor?.kind === "object" ? catalog.find(object => object.objectId === anchor.objectId)?.position : undefined;
      if (anchor && !position) throw new Error("Object query anchor no longer exists");
      if (input.spatial?.relation === "in-front-of" && anchor?.kind !== "viewer") throw new Error("in-front-of requires viewer anchor");
      const matches = catalog.flatMap(object => {
        if (!input.kinds.includes(object.objectKind) || anchor?.kind === "object" && anchor.objectId === object.objectId) return [];
        const dx = position ? object.position[0] - position[0] : 0, dz = position ? object.position[2] - position[2] : 0;
        const distanceMetres = Math.hypot(dx, dz);
        const forward = state.camera.forward, denominator = distanceMetres * Math.hypot(forward[0], forward[2]);
        const viewAngleDegrees = denominator ? Math.acos(Math.max(-1, Math.min(1, (dx * forward[0] + dz * forward[2]) / denominator))) * 180 / Math.PI : 0;
        if (position && distanceMetres > (input.spatial?.maximumDistanceMetres ?? state.world.sizeMetres)) return [];
        if (input.spatial?.relation === "in-front-of" && viewAngleDegrees > (input.spatial.maximumViewAngleDegrees ?? 45)) return [];
        return [{ ...object, worldRevision: session.document.revision,
          ...(position ? { distanceMetres } : {}), ...(anchor?.kind === "viewer" ? { viewAngleDegrees } : {}) }];
      });
      matches.sort((a, b) => {
        for (const order of input.orderBy) {
          const value = (object: typeof a) => order.field === "elevation" ? object.position[1]
            : (order.field === "distance" ? object.distanceMetres : object.viewAngleDegrees) ?? Infinity;
          const delta = value(a) - value(b);
          if (delta && !Number.isNaN(delta)) return delta * (order.direction === "asc" ? 1 : -1);
        }
        return a.objectId.localeCompare(b.objectId);
      });
      return { worldId: `seed-world-${state.world.rootSeed}`, worldRevision: session.document.revision,
        inspectedObjectCount: catalog.length, objects: matches.slice(0, input.limit) };
    }
  };
  return new Proxy(base, { get(target, property) {
    const override = Reflect.get(overrides, property);
    if (override !== undefined) return override;
    const value = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
}

function beforeRemoval(document: ReturnType<PlanningSession["export"]>, objectId: string): boolean {
  return planningResourceSnapshot(document).removedObjectIds.includes(objectId);
}

/** Reject a basin that cannot close before the transaction is accepted, using the publish-time criterion. */
function assertPlanningLakeBasinCloses(plan: IslandPlan, resourceId: string, value: SeedWorldWaterBodyResourceProperties, basin?: AuthoredLakeBasin): void {
  if (value.waterLevelMetres <= value.minimumWaterLevelMetres) return;
  try {
    resolvePlanningLakeBoundary(plan, resourceId, value, basin);
  } catch (error) {
    throw new Error("Water basin does not close on the terrain here; move the water body or reduce its radius."
      + (error instanceof Error ? ` ${error.message}` : ""));
  }
}
