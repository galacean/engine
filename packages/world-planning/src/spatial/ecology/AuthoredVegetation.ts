import { compileExactVegetationCandidatePositions } from "../../runtime/SeedWorldPopulationPlan.ts";
import { PopulationInstanceClearanceIndex } from "../../runtime/SeedWorldPopulationClearance.ts";
import type { PlanningResource } from "../PlanningResources";
import { planningRemovedObjectIds } from "../PlanningResources";
import type { SeedWorldPopulationInstance } from "../../runtime/SeedWorldPopulationPlan.ts";
import {
  getSeedWorldAssetPlacementProfile,
  resolveSeedWorldAssetPlacement,
  SEED_WORLD_ASSET_PLACEMENT_PROFILE_VERSION
} from "../../world/SeedWorldAssetPlacementProfile";
import { SEED_WORLD_TREE_SPECIES_PROFILES } from "@galacean/engine-vegetation/world/SeedWorldTreeSpecies";
import { SEED_WORLD_MAXIMUM_EXACT_VEGETATION_INSTANCES } from "../../world/SeedWorldPlanner";
import { planningTreeAssetScale } from "../runtime/PlanningTreeAssets";

export function authoredVegetationRank(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return hash >>> 0;
}

/** Shared deterministic realization for draft queries, receipts and the renderer. */
export function compileAuthoredVegetation(
  resources: readonly PlanningResource[],
  size: number,
  seed: number,
  occupied: readonly SeedWorldPopulationInstance[] = [],
  treeEligible?: (instance: SeedWorldPopulationInstance) => boolean
): SeedWorldPopulationInstance[] {
  const result: SeedWorldPopulationInstance[] = [];
  const generated: SeedWorldPopulationInstance[] = [];
  const removed = planningRemovedObjectIds(resources);
  const singleIds = new Set(
    resources
      .filter(
        (resource) => resource.resourceType === "vegetation-brush" && resource.properties.distributionKind === "single"
      )
      .map((resource) => resource.resourceId)
  );
  for (const resource of resources) {
    if (resource.resourceType !== "vegetation-brush") continue;
    const value = resource.properties;
    if (value.category !== "tree" && value.category !== "shrub") continue;
    const single = value.distributionKind === "single";
    // An explicitly addressed plant is an edit atom, not a new layout search.
    const clearance =
      value.category === "tree" && !single
        ? new PopulationInstanceClearanceIndex(size, [
            ...occupied.filter(
              (instance) => !singleIds.has(instance.id) && !singleIds.has(instance.authoringBrushId ?? "")
            ),
            ...generated.filter((instance) => !singleIds.has(instance.authoringBrushId ?? ""))
          ])
        : undefined;
    const profile = getSeedWorldAssetPlacementProfile(value.category);
    const nominalArea = profile.geometry.footprintMetres[0] * profile.geometry.footprintMetres[1];
    const count =
      value.requestedPlantCount ??
      Math.min(
        SEED_WORLD_MAXIMUM_EXACT_VEGETATION_INSTANCES,
        Math.max(1, Math.round((Math.PI * value.radiusMetres ** 2 * value.densityScale) / nominalArea))
      );
    if (count > SEED_WORLD_MAXIMUM_EXACT_VEGETATION_INSTANCES)
      throw new Error(
        `Authored vegetation requests ${count} plants; supported exact count is ${SEED_WORLD_MAXIMUM_EXACT_VEGETATION_INSTANCES}`
      );
    const positions =
      value.category === "tree" && !single
        ? compileExactVegetationCandidatePositions(
            { sizeMetres: size },
            {
              id: resource.resourceId,
              category: "tree",
              center: { x: value.x / size, y: value.z / size },
              radiusMetres: value.radiusMetres,
              exactPlacement: "scatter",
              seed: value.seed ?? seed,
              lockWidthToHeight: false
            },
            { profileKey: "tree" },
            count
          )
        : undefined;
    let realized = 0;
    for (let slot = 0; slot < (positions?.length ?? count) && realized < count; slot++) {
      const ordinal = realized;
      const rank = authoredVegetationRank(`${value.seed ?? seed}:${resource.resourceId}:${ordinal}`);
      const angle =
        ordinal * Math.PI * (3 - Math.sqrt(5)) +
        (authoredVegetationRank(`${value.seed ?? seed}:${resource.resourceId}`) / 0x100000000) * Math.PI * 2;
      const radius = value.distributionKind === "single" ? 0 : value.radiusMetres * Math.sqrt((ordinal + 0.5) / count);
      const x = positions ? positions[slot][0] + size / 2 : value.x + radius * Math.cos(angle);
      const z = positions ? positions[slot][1] + size / 2 : value.z + radius * Math.sin(angle);
      if (!single && (x < 0 || z < 0 || x > size || z > size)) {
        if (positions) continue;
        throw new Error("Authored vegetation extends outside the world");
      }
      const intent = {
        profileKey: value.category,
        role: "field" as const,
        sizeRank: rank / 0x100000000,
        shapeVariationKey: rank
      };
      const placement = resolveSeedWorldAssetPlacement(intent);
      const species =
        value.category === "tree"
          ? SEED_WORLD_TREE_SPECIES_PROFILES[rank % SEED_WORLD_TREE_SPECIES_PROFILES.length]
          : undefined;
      const [width, depth] = placement.footprintMetres,
        height = profile.geometry.verticalBoundsMetres[1] * placement.scale[1];
      const instance: SeedWorldPopulationInstance = {
        // A single authored plant is the asset itself; only area members need distinct object IDs.
        id: value.distributionKind === "single" ? resource.resourceId : `population:${resource.resourceId}:${ordinal}`,
        authoringBrushId: resource.resourceId,
        category: value.category,
        sourceCellId: `cell-${Math.min(Math.ceil(size / 64) - 1, Math.floor(x / 64))}-${Math.min(Math.ceil(size / 64) - 1, Math.floor(z / 64))}`,
        ordinal,
        normalizedPosition: { x: x / size, y: z / size },
        intent,
        profileVersion: SEED_WORLD_ASSET_PLACEMENT_PROFILE_VERSION,
        prototypeFamily: value.category,
        prototypeRank: rank,
        ...(species
          ? {
              treeSpeciesProfileKey: species.key,
              assetRecipeId: species.assetRecipeId,
              treePaletteKey: species.palettes[0].key
            }
          : {}),
        scale: species ? planningTreeAssetScale(species.assetRecipeId, width, height, depth) : placement.scale,
        footprintMetres: placement.footprintMetres,
        yawRadians: (rank / 0x100000000) * Math.PI * 2,
        colorVariation: 0
      };
      if (
        instance.category === "tree" &&
        !single &&
        ((treeEligible && !treeEligible(instance)) || clearance!.overlaps(instance))
      )
        continue;
      realized++;
      generated.push(instance);
      if (!removed.has(instance.id)) result.push(instance);
      clearance?.add(instance);
    }
    if (realized !== count && (value.requestedPlantCount !== undefined || value.distributionKind === "single"))
      throw new RangeError(
        `VEGETATION_CAPACITY_EXCEEDED: '${resource.resourceId}' requested ${count} plants but only ${realized} fit`
      );
  }
  return result;
}

/** Add authored coverage to a detached species mask. Existing coverage is retained. */
export function applyAuthoredDetailCoverage(
  samples: Uint8Array,
  resolution: number,
  size: number,
  resources: readonly PlanningResource[],
  category: "grass" | "flower" | "water-grass",
  water: Uint8Array,
  ownership?: { ids: string[]; samples: Uint32Array }
): number {
  const matching = resources
    .filter((resource) => resource.resourceType === "vegetation-brush")
    .filter((resource) => resource.properties.category === category);
  if (!matching.length) return 1;
  const densities = Float64Array.from(samples, (value) => value / 255);
  const spacing = size / (resolution - 1);
  for (const { resourceId, properties: value } of matching) {
    let owner = ownership ? ownership.ids.indexOf(resourceId) + 1 : 0;
    if (ownership && !owner) {
      ownership.ids.push(resourceId);
      owner = ownership.ids.length;
    }
    if (value.x < 0 || value.z < 0 || value.x > size || value.z > size)
      throw new Error("Authored vegetation is outside the world");
    const x0 = Math.max(0, Math.floor((value.x - value.radiusMetres) / spacing));
    const x1 = Math.min(resolution - 1, Math.ceil((value.x + value.radiusMetres) / spacing));
    const z0 = Math.max(0, Math.floor((value.z - value.radiusMetres) / spacing));
    const z1 = Math.min(resolution - 1, Math.ceil((value.z + value.radiusMetres) / spacing));
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        const index = z * resolution + x;
        if (category === "water-grass" && water[index] === 0) continue;
        if (Math.hypot(x * spacing - value.x, z * spacing - value.z) > value.radiusMetres) continue;
        densities[index] += value.densityScale;
        if (ownership && value.densityScale > 0 && !ownership.samples[index]) ownership.samples[index] = owner;
      }
  }
  let maximum = 1;
  for (const density of densities) {
    if (!Number.isFinite(density)) throw new Error("Authored vegetation density exceeds numerical range");
    maximum = Math.max(maximum, density);
  }
  for (let i = 0; i < samples.length; i++) samples[i] = Math.round((255 * densities[i]) / maximum);
  return maximum;
}
