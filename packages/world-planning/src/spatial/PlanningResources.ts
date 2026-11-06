import * as z from "zod";
import { hashRiverStableValue } from "@galacean/engine-water/water/compiler/index";
import type {
  SeedWorldAuthoringResource,
  SeedWorldAuthoringSnapshot,
  SeedWorldVegetationBrushInput,
  SeedWorldTerrainPatchInput,
  SeedWorldTerrainFeatureInput
} from "../agent-adapter/ports/SeedWorldEnginePort";
import type { PlanningDocument } from "./PlanningDocument";
import {
  SEED_WORLD_REMOVABLE_OBJECT_KINDS,
  type SeedWorldObjectRemovalInput
} from "../agent-adapter/ports/SeedWorldEnginePort";
import {
  treeVariationKey,
  validateSeedWorldTreeShapePatch,
  type SeedWorldTreeShapePatch
} from "@galacean/engine-vegetation/world/SeedWorldTreeShapeControls";
import type { SeedWorldRiverInput } from "../agent-adapter/ports/SeedWorldEnginePort";
import type { SeedWorldWaterBodyResourceProperties } from "../agent-adapter/ports/SeedWorldEnginePort";

/** Only authored intent is persisted. Hashes, realized instances and bounds are projections. */
export interface PlanningVegetationResource {
  resourceType: "vegetation-brush";
  resourceId: string;
  properties: SeedWorldVegetationBrushInput;
}
export interface PlanningTerrainPatchResource {
  resourceType: "terrain-patch";
  resourceId: string;
  properties: SeedWorldTerrainPatchInput;
}
export interface PlanningTerrainFeatureResource {
  resourceType: "terrain-feature";
  resourceId: string;
  properties: SeedWorldTerrainFeatureInput;
}
export interface PlanningObjectRemovalResource {
  resourceType: "object-removal";
  resourceId: string;
  properties: SeedWorldObjectRemovalInput;
}
export interface PlanningTreeVariationResource {
  resourceType: "tree-variation";
  resourceId: string;
  properties: { recipeId: string; variationIndex: number; controls: SeedWorldTreeShapePatch };
}
export interface PlanningRiverResource {
  resourceType: "river";
  resourceId: string;
  properties: SeedWorldRiverInput;
}
export interface PlanningLakeResource {
  resourceType: "water-body";
  resourceId: string;
  properties: SeedWorldWaterBodyResourceProperties;
}
export type PlanningResource =
  | PlanningVegetationResource
  | PlanningTerrainPatchResource
  | PlanningTerrainFeatureResource
  | PlanningObjectRemovalResource
  | PlanningTreeVariationResource
  | PlanningRiverResource
  | PlanningLakeResource;
export function planningRemovedObjectIds(resources: readonly PlanningResource[]): Set<string> {
  return new Set(
    resources.flatMap((resource) => (resource.resourceType === "object-removal" ? [resource.properties.objectId] : []))
  );
}
export function isPlanningTerrainResource(
  resource: PlanningResource
): resource is PlanningTerrainPatchResource | PlanningTerrainFeatureResource {
  return resource.resourceType === "terrain-patch" || resource.resourceType === "terrain-feature";
}

/** Shared authored physical dependencies for Terrain rasters and hydrology.
 * Appearance is persisted on the resource but cannot invalidate either derived field.
 */
export function planningTerrainAuthoringInputs(resources: readonly PlanningResource[] = []) {
  return resources
    .filter((resource) => isPlanningTerrainResource(resource) || resource.resourceType === "water-body")
    .map((resource) => {
      if (resource.resourceType !== "water-body") return resource;
      const { colorRgb, ...properties } = resource.properties;
      return { ...resource, properties };
    });
}

const vegetation = z
  .strictObject({
    category: z.enum(["tree", "shrub", "grass", "flower", "water-grass"]),
    plantKind: z.enum(["tree", "shrub", "grass", "flower", "aquatic-grass"]),
    distributionKind: z.enum(["single", "cluster", "area"]),
    x: z.number().finite(),
    z: z.number().finite(),
    radiusMetres: z.number().positive(),
    densityScale: z.number().nonnegative(),
    requestedPlantCount: z.number().int().positive().optional(),
    seed: z.number().int().min(0).max(0xffffffff).optional()
  })
  .superRefine((value, context) => {
    if (value.category !== (value.plantKind === "aquatic-grass" ? "water-grass" : value.plantKind))
      context.addIssue({ code: "custom", message: "Vegetation category disagrees with plant kind" });
    if (value.distributionKind === "single" && value.requestedPlantCount !== 1)
      context.addIssue({ code: "custom", message: "A single plant must request exactly one plant" });
    if (value.distributionKind === "cluster" && value.requestedPlantCount === undefined)
      context.addIssue({ code: "custom", message: "A counted cluster requires a plant count" });
  });
const position = { x: z.number().finite(), z: z.number().finite() };
const hill = z.strictObject({
  ...position,
  kind: z.literal("hill"),
  headingDegrees: z.number().finite(),
  pedestalLiftMetres: z.number().nonnegative(),
  peakReliefMetres: z.number().nonnegative(),
  influenceMajorRadiusMetres: z.number().positive(),
  influenceMinorRadiusMetres: z.number().positive(),
  bodyMajorRadiusMetres: z.number().positive(),
  bodyMinorRadiusMetres: z.number().positive()
});
const landform = z.strictObject({
  ...position,
  kind: z.enum(["mountain", "ridge", "canyon", "valley", "slope", "plateau", "basin"]),
  headingDegrees: z.number().finite(),
  lengthMetres: z.number().positive(),
  widthMetres: z.number().positive(),
  elevationDeltaMetres: z.number().finite(),
  sharpness: z.number().min(0).max(1),
  asymmetry: z.number().min(0).max(1),
  roughness: z.number().min(0).max(1),
  erosion: z.number().min(0).max(1),
  seed: z.number().int().min(0).max(0xffffffff)
});
const identity = { resourceId: z.string().min(1) };
const colorRgb = z
  .tuple([z.number().int().min(0).max(255), z.number().int().min(0).max(255), z.number().int().min(0).max(255)])
  .optional();
const resources = z.array(
  z.discriminatedUnion("resourceType", [
    z.strictObject({
      ...identity,
      resourceType: z.literal("water-body"),
      properties: z
        .strictObject({
          ...position,
          colorRgb,
          kind: z.enum(["pond", "lake"]),
          radiusMetres: z.number().positive(),
          depthMetres: z.number().positive(),
          shorelineIrregularity: z.number().min(0).max(1),
          seed: z.number().int().min(0).max(0xffffffff),
          canonicalWaterLevelMetres: z.number().finite(),
          minimumWaterLevelMetres: z.number().finite(),
          maximumWaterLevelMetres: z.number().finite(),
          waterLevelMetres: z.number().finite()
        })
        .superRefine((value, context) => {
          if (
            value.minimumWaterLevelMetres !== value.canonicalWaterLevelMetres - value.depthMetres ||
            value.maximumWaterLevelMetres !== value.canonicalWaterLevelMetres ||
            value.waterLevelMetres < value.minimumWaterLevelMetres ||
            value.waterLevelMetres > value.maximumWaterLevelMetres
          )
            context.addIssue({ code: "custom", message: "Lake water level is outside its basin range" });
        })
    }),
    z.strictObject({
      ...identity,
      resourceType: z.literal("river"),
      properties: z.strictObject({
        ...position,
        colorRgb,
        kind: z.enum(["stream", "river"]),
        headingDegrees: z.number().finite(),
        lengthMetres: z.number().positive(),
        widthMetres: z.number().positive(),
        depthMetres: z.number().positive(),
        flowSpeed: z.number().nonnegative(),
        meander: z.number().min(0).max(1)
      })
    }),
    z.strictObject({
      ...identity,
      resourceType: z.literal("tree-variation"),
      properties: z.strictObject({
        recipeId: z.string().min(1),
        variationIndex: z.number().int().min(0).max(6),
        controls: z.custom<SeedWorldTreeShapePatch>((value) => {
          if (!value || typeof value !== "object" || Array.isArray(value)) return false;
          try {
            validateSeedWorldTreeShapePatch(value);
            return true;
          } catch {
            return false;
          }
        }, "Invalid tree shape controls")
      })
    }),
    z.strictObject({
      ...identity,
      resourceType: z.literal("object-removal"),
      properties: z.strictObject({
        ...position,
        objectId: z.string().min(1),
        objectKind: z.enum(SEED_WORLD_REMOVABLE_OBJECT_KINDS),
        radiusMetres: z.number().positive()
      })
    }),
    z.strictObject({ ...identity, resourceType: z.literal("vegetation-brush"), properties: vegetation }),
    z.strictObject({
      ...identity,
      resourceType: z.literal("terrain-patch"),
      properties: z.strictObject({
        ...position,
        radiusMetres: z.number().positive(),
        heightDeltaMetres: z.number().finite()
      })
    }),
    z.strictObject({ ...identity, resourceType: z.literal("terrain-feature"), properties: z.union([hill, landform]) })
  ])
);

export function parsePlanningResources(value: unknown): PlanningResource[] {
  const parsed = resources.parse(value);
  if (new Set(parsed.map((resource) => resource.resourceId)).size !== parsed.length)
    throw new Error("Duplicate planning resource identity");
  for (const resource of parsed)
    if (
      resource.resourceType === "tree-variation" &&
      resource.resourceId !== treeVariationKey(resource.properties.recipeId, resource.properties.variationIndex)
    )
      throw new Error("Tree variation identity disagrees with its recipe/effect");
  return parsed;
}
export function validatePlanningResources(value: unknown): asserts value is PlanningResource[] {
  parsePlanningResources(value);
}

export function planningResourceSnapshot(document: PlanningDocument): SeedWorldAuthoringSnapshot {
  const resources: SeedWorldAuthoringResource[] = (document.authoredResources ?? [])
    .filter((resource) => resource.resourceType !== "tree-variation")
    .map((resource) => {
      const contentHash = hashRiverStableValue(resource);
      if (resource.resourceType === "terrain-patch")
        return { ...resource, properties: { ...resource.properties }, contentHash };
      return { ...structuredClone(resource), contentHash };
    });
  return {
    activeRevision: document.revision,
    draftRevision: document.revision,
    authoringStateHash: hashRiverStableValue(document.authoredResources ?? []),
    resources,
    removedObjectIds: [...planningRemovedObjectIds(document.authoredResources ?? [])]
  };
}
