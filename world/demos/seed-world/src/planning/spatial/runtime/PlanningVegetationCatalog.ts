import type { SeedWorldAssetCandidate } from "@galacean/engine-world-planning/agent-adapter/SeedWorldAssetManager";
import type { PlanningNaturalVegetationRuntime } from "@galacean/engine-world-planning/spatial/runtime/PlanningNaturalVegetationRuntime";
import type { SeedWorldObject } from "@galacean/engine-world-planning/agent-adapter/ports/SeedWorldEnginePort";
import type { LandscapePlantInstance } from "@galacean/engine-vegetation/world/VegetationLandscapePlan";

type PlantSnapshot = Pick<ReturnType<PlanningNaturalVegetationRuntime["getAuthoringSnapshot"]>, "flowers" | "seed"> & {
  readonly trees: readonly LandscapePlantInstance[];
  readonly authoredPlantIds: readonly string[];
};

/** Stable population and region identities come from the published solver, independent of camera residency. */
export function planningVegetationCatalog(runtime: { getAuthoringSnapshot(): PlantSnapshot }): readonly SeedWorldAssetCandidate[] {
  const { trees, flowers, seed, authoredPlantIds } = runtime.getAuthoringSnapshot();
  const authored = new Set(authoredPlantIds);
  return [
    ...trees.map(instance => {
      const [x, y, z] = instance.position, radius = instance.radius;
      const kind = instance.layerId === "乔木" ? "tree" : "shrub";
      return {
        ref: { id: instance.id, domain: "vegetation" as const, kind, source: authored.has(instance.id) ? "authored" as const : "natural" as const },
        position: instance.position,
        bounds: { minimum: [x - radius, y, z - radius] as const, maximum: [x + radius, y + instance.height, z + radius] as const },
        properties: { assetKind: kind, proceduralAssetId: instance.assetId, planningEntityId: instance.id,
          headingDegrees: instance.yaw, scale: instance.scaleAxes ?? [instance.scale, instance.scale, instance.scale] }
      };
    }),
    ...flowers.filter(region => region.areaM2 > 0).map(region => ({
      ref: { id: region.id, domain: "vegetation" as const, kind: "flower-field", source: "natural" as const },
      properties: { assetKind: "flower-field", distribution: "habitat-fill", seed, planningEntityId: region.id }
    }))
  ];
}

/** Native plants use their visible geometry for object queries as well as picking.
 * The legacy population adapter intentionally owns no native tree instances. */
export function planningVegetationObjects(snapshot: PlantSnapshot, revision: number): SeedWorldObject[] {
  const authored = new Set(snapshot.authoredPlantIds);
  return snapshot.trees.map(instance => {
    const [x, y, z] = instance.position, radius = instance.radius;
    return { catalogOwner: "planning", worldId: `seed-world-${snapshot.seed}`, worldRevision: revision,
      objectId: instance.id, objectKind: instance.layerId === "乔木" ? "tree" : "shrub", position: instance.position,
      footprintMetres: [radius * 2, radius * 2],
      source: { kind: authored.has(instance.id) ? "authoring" : "population", sourceId: instance.id },
      properties: { proceduralAssetId: instance.assetId, yawRadians: instance.yaw * Math.PI / 180,
        scale: instance.scaleAxes ?? [instance.scale, instance.scale, instance.scale],
        bounds: { minimum: [x - radius, y, z - radius], maximum: [x + radius, y + instance.height, z + radius] } } };
  });
}
