import { createPlanningTreeEligibility } from "./PlanningTreeEligibility";
import { sampleDensityOwner, hashDetailOwnership } from "../../world/SeedWorldDetailCandidateLattice";
import { roadSurfaces } from "../layout/RoadTopology";
import { planningRemovedObjectIds } from "../PlanningResources";
import { createPlanningWaterQuery } from "./PlanningWaterQueries";
import type { IslandPlan, PlanLandscape } from "../../semantic-study/IslandPlanModel";
import type { PlanningHeightmap } from "../../semantic-study/PlanningHeightmap";
import type { PlanningAlphamap } from "../../semantic-study/PlanningAlphamap";
import { vegetationCoverage } from "../ecology/VegetationCoverage";
import { naturalVegetationAt } from "../../planning-data/NaturalVegetationProfile";
import { rasterizeCoverageRegions } from "../ecology/CoverageRaster";
import type { SeedWorldPopulationPreview, SeedWorldPopulationInstance } from "../../runtime/SeedWorldPopulationPlan.ts";
import {
  SEED_WORLD_DETAIL_SPECIES_PROFILES,
  SEED_WORLD_DETAIL_SPECIES_PROFILE_VERSION
} from "../../world/SeedWorldDetailSpecies";
import {
  SEED_WORLD_TREE_SPECIES_PROFILES,
  SEED_WORLD_TREE_SPECIES_PROFILE_VERSION
} from "@galacean/engine-vegetation/world/SeedWorldTreeSpecies";
import {
  SEED_WORLD_TREE_COMMUNITY_PROFILE,
  SEED_WORLD_TREE_COMMUNITY_PROFILE_VERSION
} from "@galacean/engine-vegetation/world/SeedWorldTreeCommunity";
import { SEED_WORLD_ASSET_PLACEMENT_PROFILE_VERSION } from "../../world/SeedWorldAssetPlacementProfile";
import { SEED_WORLD_DEFAULT_WETLAND_BASIN_STYLE, type SeedWorldFields } from "../../runtime/SeedWorldFields.ts";
import { SeedWorldLandCover } from "../../world/SeedWorldPlanner";
import type { SeedWorldPopulationWorld } from "../../runtime/SeedWorldPopulationRuntimeCell.ts";
import { planningTreeAssetScale } from "./PlanningTreeAssets";
import rules from "./population-presentation.json";
import { compileAuthoredVegetation, applyAuthoredDetailCoverage } from "../ecology/AuthoredVegetation";

/** Canonical terrain samples published by the same planning snapshot. */
export interface PlanningPopulationTerrain {
  height: PlanningHeightmap;
  alpha: PlanningAlphamap;
}
/** Literal Seed renderer inputs; no generation state or duplicate semantic world is fabricated. */
export interface PlanningPopulationData {
  world: SeedWorldPopulationWorld;
  fields: SeedWorldFields;
  population: SeedWorldPopulationPreview;
}
const hashText = (text: string): number => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
};
function hashBytes(bytes: Uint8Array): number {
  let h = 2166136261;
  for (const b of bytes) h = Math.imul(h ^ b, 16777619);
  return h >>> 0;
}
/** Endpoint-aligned bilinear resampling preserves the producer's world-space boundaries. */
function sample(bytes: Uint8Array, resolution: number, u: number, v: number, channel = 0, stride = 1): number {
  const x = Math.min(resolution - 1, Math.max(0, u * (resolution - 1))),
    z = Math.min(resolution - 1, Math.max(0, v * (resolution - 1)));
  const ix = Math.floor(x),
    iz = Math.floor(z),
    jx = Math.min(resolution - 1, ix + 1),
    jz = Math.min(resolution - 1, iz + 1),
    fx = x - ix,
    fz = z - iz;
  const a = bytes[(iz * resolution + ix) * stride + channel],
    b = bytes[(iz * resolution + jx) * stride + channel];
  const c = bytes[(jz * resolution + ix) * stride + channel],
    d = bytes[(jz * resolution + jx) * stride + channel];
  return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
}
/** Adapt one published planner snapshot; never invoke the Root-Seed world/population generator. */
export function compilePlanningPopulation(
  plan: IslandPlan,
  terrain: PlanningPopulationTerrain
): PlanningPopulationData {
  const size = plan.parameters.width;
  if (!Number.isFinite(size) || size <= 0 || size !== plan.parameters.depth)
    throw new Error("Seed population adapter currently requires a square planning domain");
  const { height, alpha } = terrain,
    resolution = rules.surfaceResolution,
    n = resolution * resolution;
  if (
    !Number.isInteger(height.resolution) ||
    height.resolution < 2 ||
    !Number.isInteger(alpha.resolution) ||
    alpha.resolution < 2 ||
    !Number.isFinite(height.decodeOffset) ||
    !Number.isFinite(height.decodeScale) ||
    height.decodeScale <= 0 ||
    height.encoded.length !== height.resolution ** 2 ||
    alpha.weights.length !== alpha.resolution ** 2 * 4 ||
    alpha.coverage.length !== alpha.resolution ** 2 ||
    alpha.width !== size ||
    alpha.depth !== size
  )
    throw new Error("Invalid published terrain buffers");
  const grassAt = naturalVegetationAt(plan);
  const coverage = vegetationCoverage(plan),
    materialWeights = new Uint8Array(n * 4),
    waterMask = new Uint8Array(n),
    habitat = new Uint8Array(n);
  const flowerOwners = new Uint32Array(n);
  const grass = new Uint8Array(n),
    flowers = new Uint8Array(n),
    road = rasterizeCoverageRegions(
      roadSurfaces(plan)
        .filter((r) => r.outline?.length)
        .map((r) => [r.outline!]),
      resolution,
      size,
      size
    );
  const occupied = rasterizeCoverageRegions(
    [...plan.buildings.map((b) => [b.outline]), ...plan.rocks.map((r) => [r.outline])],
    resolution,
    size,
    size
  );
  // Natural and authored water share the same physical predicate, including before the first authored pond.
  const queryWater = createPlanningWaterQuery(plan, height.sample);
  for (let z = 0; z < resolution; z++)
    for (let x = 0; x < resolution; x++) {
      const i = z * resolution + x,
        u = x / (resolution - 1),
        v = z / (resolution - 1),
        land = sample(alpha.coverage, alpha.resolution, u, v) / 255;
      const water = sample(alpha.weights, alpha.resolution, u, v, 2, 4) / 255;
      let g = Math.round(sample(alpha.weights, alpha.resolution, u, v, 0, 4) * land);
      const wet = Math.round(255 * (1 - land + land * water));
      g = Math.min(g, 255 - wet);
      const roadWeight = Math.min(255 - g - wet, road[i]);
      // The grass layer owns both its substrate and its detail population.
      // Transfer absent grass coverage to the existing bare mineral channel;
      // retain base habitat samples for independently controlled plant layers.
      const naturalGrass = grassAt({ x: u * size, z: v * size }).grass!;
      const surfaceGrass = Math.round(g * naturalGrass);
      materialWeights[i * 4] = surfaceGrass;
      materialWeights[i * 4 + 1] = wet;
      materialWeights[i * 4 + 2] = 255 - surfaceGrass - wet - roadWeight;
      materialWeights[i * 4 + 3] = roadWeight;
      waterMask[i] = queryWater(u * size, v * size).water ? 255 : 0;
      const free = waterMask[i] ? 0 : (1 - road[i] / 255) * (1 - occupied[i] / 255);
      // Surface coverage controls size; ecology is applied once by the ground-population projection.
      grass[i] = waterMask[i] ? 0 : Math.round(255 * land * (1 - water));
      flowers[i] = Math.round(sample(coverage.flowers, coverage.resolution, u, v) * land * free);
      if (flowers[i])
        flowerOwners[i] = sampleDensityOwner(
          coverage.flowers,
          coverage.ownership.samples,
          coverage.resolution,
          u * (coverage.resolution - 1),
          v * (coverage.resolution - 1)
        );
      habitat[i] = waterMask[i] ? SeedWorldLandCover.Wetland : SeedWorldLandCover.Grassland;
    }
  const species = SEED_WORLD_TREE_SPECIES_PROFILES.filter((s) => rules.treeSpecies.includes(s.key));
  if (!species.length) throw new Error("Planning vegetation requires at least one configured Seed tree species");
  const removed = planningRemovedObjectIds(plan.authoredResources ?? []);
  const projectTree = (p: Omit<PlanLandscape, "baseHeight">, ordinal: number): SeedWorldPopulationInstance => {
    if (
      ![p.width, p.depth, p.height].every((v) => Number.isFinite(v) && v > 0) ||
      ![p.center.x, p.center.z, p.yaw].every(Number.isFinite)
    )
      throw new RangeError(`Planned tree ${p.id} has invalid dimensions or position`);
    const rank = hashText(`${plan.parameters.seed}:${p.id}`),
      s = species[rank % species.length];
    return {
      id: p.id,
      category: "tree",
      sourceCellId: `cell-${Math.min(Math.ceil(size / 64) - 1, Math.floor(p.center.x / 64))}-${Math.min(Math.ceil(size / 64) - 1, Math.floor(p.center.z / 64))}`,
      ordinal,
      normalizedPosition: { x: p.center.x / size, y: p.center.z / size },
      intent: {
        profileKey: "tree",
        role: p.role === "poi" ? "hero" : "field",
        sizeRank: 0.5,
        shapeVariationKey: rank
      },
      profileVersion: SEED_WORLD_ASSET_PLACEMENT_PROFILE_VERSION,
      prototypeFamily: "tree",
      prototypeRank: rank,
      treeSpeciesProfileKey: s.key,
      assetRecipeId: s.assetRecipeId,
      treePaletteKey: s.palettes[0].key,
      scale: planningTreeAssetScale(s.assetRecipeId, p.width, p.height, p.depth),
      footprintMetres: [p.width, p.depth],
      yawRadians: p.yaw,
      colorVariation: 0
    };
  };
  const treeInstances = (plan.landscapes ?? [])
    .filter((p) => p.kind === "tree" && p.assetRenderMode !== "prefab" && !removed.has(p.id))
    .map(projectTree);
  const generatesTrees = plan.authoredResources?.some(
    (resource) =>
      resource.resourceType === "vegetation-brush" &&
      resource.properties.category === "tree" &&
      resource.properties.distributionKind !== "single"
  );
  const treeEligible = generatesTrees
    ? createPlanningTreeEligibility(plan, height.sample, { sizeMetres: size, surfaceResolution: resolution, waterMask })
    : undefined;
  const base = plan.spatialLayout?.landscapeBase;
  const baselineTrees = generatesTrees
    ? (base
        ? [...(plan.spatialLayout?.baselineLandscapes ?? []).filter((p) => p.role === "poi"), ...base.slots]
        : (plan.spatialLayout?.baselineLandscapes ?? plan.landscapes ?? [])
      )
        .filter((p) => p.kind === "tree")
        .map(projectTree)
    : [];
  treeInstances.push(
    ...compileAuthoredVegetation(plan.authoredResources ?? [], size, plan.parameters.seed, baselineTrees, treeEligible)
  );
  const aquatic = new Uint8Array(n);
  const grassScale = applyAuthoredDetailCoverage(
    grass,
    resolution,
    size,
    plan.authoredResources ?? [],
    "grass",
    waterMask
  );
  const ownership = { ids: [...coverage.ownership.ids], samples: flowerOwners };
  const flowerScale = applyAuthoredDetailCoverage(
    flowers,
    resolution,
    size,
    plan.authoredResources ?? [],
    "flower",
    waterMask,
    ownership
  );
  const aquaticScale = applyAuthoredDetailCoverage(
    aquatic,
    resolution,
    size,
    plan.authoredResources ?? [],
    "water-grass",
    waterMask
  );
  const grassHash = (hashBytes(grass) ^ hashText(String(grassScale))) >>> 0,
    flowerHash = (hashBytes(flowers) ^ hashText(String(flowerScale))) >>> 0,
    aquaticHash = (hashBytes(aquatic) ^ hashText(String(aquaticScale))) >>> 0;
  const flowerPublicationHash = (flowerHash ^ hashDetailOwnership(ownership)) >>> 0;
  // Preserve Seed's production species-to-catalog binding, including Terrain/Grass cluster grass.
  const detailProfiles = SEED_WORLD_DETAIL_SPECIES_PROFILES.filter(
      (p) => p.habitat === "terrestrial" || aquatic.some((value) => value > 0)
    ),
    detailDensityFields = detailProfiles.map((p) => ({
      prototypeFamily: p.key,
      category: p.category,
      assetProfileKey: p.assetProfileKey,
      resolution,
      maximumDensityPerSquareMetre:
        p.targetDensityPerSquareMetre *
        (p.category === "grass" ? rules.grassDensityMultiplier : rules.flowerDensityMultiplier) *
        (p.habitat === "aquatic" ? aquaticScale : p.category === "grass" ? grassScale : flowerScale),
      samples: p.habitat === "aquatic" ? aquatic : p.category === "grass" ? grass : flowers,
      ownership: p.category === "flower" ? ownership : undefined,
      // Density bytes select candidates; a local mask edit must not reseed every grass cell.
      candidateSeed:
        p.category === "grass"
          ? hashText(`${plan.parameters.seed}:${p.key}`)
          : p.category === "flower"
            ? flowerHash
            : undefined,
      hash: p.habitat === "aquatic" ? aquaticHash : p.category === "grass" ? grassHash : flowerPublicationHash
    }));
  const population: SeedWorldPopulationPreview = {
    treeSpeciesProfileVersion: SEED_WORLD_TREE_SPECIES_PROFILE_VERSION,
    treeSpeciesProfiles: species,
    treeCommunityProfileVersion: SEED_WORLD_TREE_COMMUNITY_PROFILE_VERSION,
    treeCommunityProfile: SEED_WORLD_TREE_COMMUNITY_PROFILE,
    detailSpeciesProfileVersion: SEED_WORLD_DETAIL_SPECIES_PROFILE_VERSION,
    detailSpeciesProfiles: detailProfiles,
    treeScatterOperations: [],
    detailBrushOperations: [],
    treeInstances,
    detailDensityFields,
    hash: (hashText(JSON.stringify(treeInstances)) ^ grassHash ^ flowerPublicationHash ^ aquaticHash) >>> 0
  };
  const fields: SeedWorldFields = {
    rootSeed: plan.parameters.seed,
    sizeMetres: size,
    worldOrigin: [0, 0],
    heightDecode: { offset: height.decodeOffset, scale: height.decodeScale },
    heightResolution: height.resolution,
    surfaceResolution: resolution,
    heightSamples: new Uint16Array(height.encoded),
    surfaceHeights: height.heights,
    materialWeights,
    rockySlopeWeight: new Uint8Array(n),
    waterMask,
    flow: new Uint8Array(n),
    sediment: new Uint8Array(n),
    wetness: new Uint8Array(n),
    wetlandWeight: new Uint8Array(n),
    riverBankDistanceMetres: new Float32Array(n),
    wetlandWaterLevelMetres: new Float32Array(n),
    habitat,
    wetlandBasinStyle: SEED_WORLD_DEFAULT_WETLAND_BASIN_STYLE,
    riverCurves: [],
    riverCurveSamples: [],
    hydrologyGeometryHash: 0,
    hydrologyBakeHash: 0,
    hash: population.hash
  };
  return {
    world: {
      rootSeed: plan.parameters.seed,
      sizeMetres: size,
      observationAnchor: { x: plan.spawn.x, y: height.sample(plan.spawn), z: plan.spawn.z }
    },
    fields,
    population
  };
}
