import {
  attachLakeGridBoundary,
  OCEAN_NEARSHORE_GPU_SHORE_DISTANCE_RANGE_MAXIMUM_METRES,
  hashStableValue,
  WATER_GENERATION_TERRAIN_TILE_AXIS_COUNT,
  type WaterGenerationCompileContextV1,
  type WaterGenerationScopedTerrainViewV1
} from "@galacean/engine-water/water/compiler/index";
import {
  WaterBodySourceKind,
  WaterBodySourceSchemaVersion,
  type WaterBodySourceV1,
  createHeightfieldWaterBodySourceDescriptorV1,
  createHeightfieldWaterRepresentationDataV1,
  type HeightfieldWaterDescriptorV1,
  HeightfieldWaterSchemaVersion,
  OceanNearshoreOutsidePolicy,
  OceanNearshoreSchemaVersion,
  WaterQualityTier,
  WaterWaveModel,
  WaterWaveSchemaVersion
} from "@galacean/engine-water/water/index";
import type { WaterBodyAsset, OceanNearshoreDescriptorV1 } from "@galacean/engine-water/water/index";

import type { CompiledWaterFootprintV1 } from "@galacean/engine-water/water/compiler/index";

import { LAKE_WATER_SPATIAL_FIELD, LAKE_WATER_SURFACE_MOTION } from "@galacean/engine-water/water/presets/lake/index";
import type { WaterGenerationBodySourceCompilerV1 } from "@galacean/engine-water/water/runtime/index";
import { createHeightfieldWaterPreparedCompilerIdentityV1 } from "@galacean/engine-water/water/runtime/heightfield/index";
import {
  OCEAN_WATER_BODY_DESCRIPTOR_SCHEMA_VERSION,
  OceanWaterCompiledResource,
  assertOceanWaterBodyDescriptor,
  type OceanWaterBodyDescriptorV1
} from "@galacean/engine-water/water/runtime/ocean/index";
import type {
  SeedWorldAuthoritativeLakeSourceV1,
  SeedWorldAuthoritativeOceanSourceV1,
  SeedWorldAuthoritativeWaterSourceDescriptorV1
} from "./SeedWorldWaterPcgAdapter.ts";
import { SEED_WORLD_LAKE_RENDER_SURFACE_OFFSET_MILLIMETRES } from "@galacean/engine-water/world/SeedWorldWaterErrorBudget";

export { SEED_WORLD_LAKE_RENDER_SURFACE_OFFSET_METRES } from "@galacean/engine-water/world/SeedWorldWaterErrorBudget";

export const SEED_WORLD_OCEAN_MAXIMUM_NEARSHORE_RESOLUTION = 512;
// Seed Ocean is render-only. The shared nearshore wave model reaches its
// deep-water identity at 12m, so deeper bathymetry carries no additional
// rendering information and only damages RGBA8 depth precision.
export const SEED_WORLD_OCEAN_MAXIMUM_RENDER_BATHYMETRY_DEPTH_METRES = 12;
const SEED_WORLD_OCEAN_MINIMUM_VISIBLE_DEPTH_METRES = 0.001;
const SEED_WORLD_OCEAN_RENDER_REFINEMENT_SCALE = 2;

// Seed World policy adapter from a generic compiled Lake Footprint to an
// existing Heightfield descriptor. The Heightfield backend remains free of
// Seed World and Hydrology types.
export class SeedWorldWaterBackendSourceCompilerV1 implements WaterGenerationBodySourceCompilerV1 {
  readonly id = "seed-world-authoritative-ocean-lake-source-v6";

  matches(asset: Readonly<WaterBodyAsset<WaterBodySourceV1>>): boolean {
    return readAuthoritativeWaterDescriptor(asset.source) !== undefined;
  }

  compile(
    asset: Readonly<WaterBodyAsset<WaterBodySourceV1>>,
    footprint: Readonly<CompiledWaterFootprintV1>,
    context: WaterGenerationCompileContextV1
  ): ReturnType<WaterGenerationBodySourceCompilerV1["compile"]> {
    const descriptor = readAuthoritativeWaterDescriptor(asset.source);
    if (!descriptor) {
      throw new Error(`WaterBody '${asset.id}' has no Seed World authoritative Water descriptor.`);
    }
    if (descriptor.bodyId !== asset.id || footprint.bodyId !== asset.id) {
      throw new Error(`WaterBody '${asset.id}' source/Footprint identity mismatch.`);
    }
    if (descriptor.authoritativeKind === "ocean-boundary-connected-v1") {
      if (asset.kind !== "ocean") throw new Error(`Ocean '${asset.id}' has a non-Ocean WaterBody kind.`);
      const source = compileOceanSource(descriptor, footprint, context);
      if (source.kind !== WaterBodySourceKind.OceanNearshore) {
        throw new Error(`Ocean '${asset.id}' did not compile an OceanNearshore source.`);
      }
      assertOceanWaterBodyDescriptor(source.descriptor);
      const representationData = OceanWaterCompiledResource.compileForTransfer(source.descriptor);
      return Object.freeze({
        source,
        representationData,
        representationDataHash: hashStableValue({
          kind: representationData.kind,
          compileKey: representationData.compileKey,
          sourceHash: representationData.sourceHash,
          physicalSourceHash: representationData.physicalSourceHash,
          compiledHash: representationData.data.compiledHash
        })
      });
    }
    if (asset.kind !== "lake") throw new Error(`Lake '${asset.id}' has a non-Lake WaterBody kind.`);
    const compiledDescriptor = attachLakeGridBoundary(compileLakeDescriptor(descriptor, footprint, context));
    const representationData = Object.freeze({
      ...createHeightfieldWaterRepresentationDataV1(compiledDescriptor),
      // Seed World registers one High geometry Quality Plan. The descriptor's
      // Medium value is only the standalone-compiler fallback and is replaced
      // by the backend before every runtime compile.
      preparedCompilerIdentity: createHeightfieldWaterPreparedCompilerIdentityV1(
        Object.freeze({ ...compiledDescriptor, quality: WaterQualityTier.High })
      )
    });
    const source: WaterBodySourceV1 = Object.freeze({
      schemaVersion: WaterBodySourceSchemaVersion.V1,
      kind: WaterBodySourceKind.GridMask,
      capabilities: Object.freeze({ localBathymetry: true, shoreSdf: true, current: false }),
      descriptor: createHeightfieldWaterBodySourceDescriptorV1(compiledDescriptor)
    });
    return Object.freeze({
      source,
      representationData,
      representationDataHash: hashStableValue(representationData)
    });
  }
}

function compileOceanSource(
  source: SeedWorldAuthoritativeOceanSourceV1,
  footprint: Readonly<CompiledWaterFootprintV1>,
  context: WaterGenerationCompileContextV1
): WaterBodySourceV1 {
  const nearshoreDescriptor = compileOceanNearshoreDescriptor(source, footprint, context);
  const config = Object.freeze({
    waterLevel: source.surfaceHeightMillimetres / 1_000,
    nearshoreDescriptor
  });
  const descriptor: OceanWaterBodyDescriptorV1 = Object.freeze({
    schemaVersion: OCEAN_WATER_BODY_DESCRIPTOR_SCHEMA_VERSION,
    id: source.bodyId,
    config
  });
  return Object.freeze({
    schemaVersion: WaterBodySourceSchemaVersion.V1,
    kind: WaterBodySourceKind.OceanNearshore,
    capabilities: Object.freeze({ localBathymetry: true, shoreSdf: true, current: false }),
    descriptor
  });
}

function compileOceanNearshoreDescriptor(
  source: SeedWorldAuthoritativeOceanSourceV1,
  footprint: Readonly<CompiledWaterFootprintV1>,
  context: WaterGenerationCompileContextV1
): Readonly<OceanNearshoreDescriptorV1> {
  const sourceResolution = context.ownership.resolution;
  const resolution = Math.min(
    SEED_WORLD_OCEAN_MAXIMUM_NEARSHORE_RESOLUTION,
    sourceResolution * SEED_WORLD_OCEAN_RENDER_REFINEMENT_SCALE
  );
  const texelCount = resolution * resolution;
  const waterLevel = source.surfaceHeightMillimetres / 1_000;
  const candidateMask = new Uint8Array(texelCount);
  const bedHeights = new Float32Array(texelCount);
  const signedShoreDistances = new Float32Array(texelCount);
  bedHeights.fill(waterLevel);
  signedShoreDistances.fill(-OCEAN_NEARSHORE_GPU_SHORE_DISTANCE_RANGE_MAXIMUM_METRES);
  const ownershipKinds = compileOceanOwnershipKinds(source.bodyId, context);
  const terrain = context.createScopedTerrainView(footprint.terrainDependencyTileIds);
  const terrainDependencyTileIds = new Set(footprint.terrainDependencyTileIds);
  const ownershipCellsPerTerrainTile = sourceResolution / WATER_GENERATION_TERRAIN_TILE_AXIS_COUNT;
  if (!Number.isInteger(ownershipCellsPerTerrainTile)) {
    throw new Error("Seed World Ocean Ownership resolution must divide the Terrain Tile layout.");
  }
  const worldSizeX = context.transform.worldSizeXMillimetres;
  const worldSizeZ = context.transform.worldSizeZMillimetres;
  for (let z = 0; z < resolution; z++) {
    if ((z & 31) === 0) context.assertUsable();
    const worldZOffsetMillimetres = ((z + 0.5) * worldSizeZ) / resolution;
    const ownershipZ = Math.min(
      sourceResolution - 1,
      Math.floor(worldZOffsetMillimetres / context.transform.ownershipCellMillimetres)
    );
    for (let x = 0; x < resolution; x++) {
      const worldXOffsetMillimetres = ((x + 0.5) * worldSizeX) / resolution;
      const ownershipX = Math.min(
        sourceResolution - 1,
        Math.floor(worldXOffsetMillimetres / context.transform.ownershipCellMillimetres)
      );
      const ownershipIndex = ownershipZ * sourceResolution + ownershipX;
      const centerKind = ownershipKinds[ownershipIndex]!;
      // A Lake or another explicit Hydrology owner may never be reinterpreted
      // as Ocean by render refinement.
      if (centerKind === OceanOwnershipKind.OtherWater) continue;
      const neighborhood = sampleOceanOwnershipNeighborhood(ownershipKinds, sourceResolution, ownershipX, ownershipZ);
      const terrainTileId =
        Math.floor(ownershipZ / ownershipCellsPerTerrainTile) * WATER_GENERATION_TERRAIN_TILE_AXIS_COUNT +
        Math.floor(ownershipX / ownershipCellsPerTerrainTile);
      const canSampleTerrain =
        terrainDependencyTileIds.has(terrainTileId) &&
        canSampleScopedHfinalSurface(
          terrainDependencyTileIds,
          context,
          worldXOffsetMillimetres,
          worldZOffsetMillimetres
        );
      if (
        centerKind === OceanOwnershipKind.Ocean &&
        (neighborhood & OCEAN_NEIGHBORHOOD_ALL_OCEAN) !== 0 &&
        !canSampleTerrain
      ) {
        const outputIndex = z * resolution + x;
        candidateMask[outputIndex] = 1;
        bedHeights[outputIndex] = waterLevel - SEED_WORLD_OCEAN_MAXIMUM_RENDER_BATHYMETRY_DEPTH_METRES;
        signedShoreDistances[outputIndex] = OCEAN_NEARSHORE_GPU_SHORE_DISTANCE_RANGE_MAXIMUM_METRES;
        continue;
      }
      // Only the one-cell Hydrology boundary halo is refined. This follows the
      // continuous Hfinal sea-level crossing without allowing render code to discover
      // a new remote sea or to read Terrain outside the Footprint dependency set.
      if ((neighborhood & OCEAN_NEIGHBORHOOD_HAS_OCEAN) === 0) continue;
      if (!canSampleTerrain) {
        throw new Error(`Seed World Ocean boundary at Ownership (${ownershipX}, ${ownershipZ}) has no Terrain halo.`);
      }
      const outputIndex = z * resolution + x;
      const terrainSurface = sampleScopedHfinalSurface(
        terrain,
        context,
        worldXOffsetMillimetres,
        worldZOffsetMillimetres
      );
      const terrainHeight = terrainSurface.heightMetres;
      const physicalDepth = waterLevel - terrainHeight;
      bedHeights[outputIndex] =
        physicalDepth > 0
          ? waterLevel - Math.min(SEED_WORLD_OCEAN_MAXIMUM_RENDER_BATHYMETRY_DEPTH_METRES, physicalDepth)
          : terrainHeight;
      signedShoreDistances[outputIndex] = estimateHfinalSignedShoreDistanceMetres(waterLevel, terrainSurface);
      if (physicalDepth > SEED_WORLD_OCEAN_MINIMUM_VISIBLE_DEPTH_METRES) {
        candidateMask[outputIndex] = 1;
      }
    }
  }
  const wetMask = retainBoundaryConnectedWetMask(candidateMask, resolution);
  for (let index = 0; index < wetMask.length; index++) {
    const magnitude = Math.min(
      OCEAN_NEARSHORE_GPU_SHORE_DISTANCE_RANGE_MAXIMUM_METRES,
      Math.max(0.000_1, Math.abs(signedShoreDistances[index]!))
    );
    signedShoreDistances[index] = wetMask[index] === 1 ? magnitude : -magnitude;
  }
  const cellSizeX = context.transform.worldSizeXMillimetres / resolution / 1_000;
  const cellSizeZ = context.transform.worldSizeZMillimetres / resolution / 1_000;
  return Object.freeze({
    schemaVersion: OceanNearshoreSchemaVersion.V1,
    id: `${source.bodyId}:nearshore`,
    waterLevel,
    grid: Object.freeze({
      originXZ: Object.freeze([
        context.transform.worldMinXMillimetres / 1_000 + cellSizeX * 0.5,
        context.transform.worldMinZMillimetres / 1_000 + cellSizeZ * 0.5
      ] as const),
      cellSizeXZ: Object.freeze([cellSizeX, cellSizeZ] as const),
      width: resolution,
      height: resolution
    }),
    bedHeights,
    signedShoreDistances,
    wetSource: Object.freeze({
      kind: "mask",
      mask: wetMask,
      minimumDepth: SEED_WORLD_OCEAN_MINIMUM_VISIBLE_DEPTH_METRES
    }),
    outsidePolicy: Object.freeze({
      negativeX: OceanNearshoreOutsidePolicy.DeepOcean,
      positiveX: OceanNearshoreOutsidePolicy.DeepOcean,
      negativeZ: OceanNearshoreOutsidePolicy.DeepOcean,
      positiveZ: OceanNearshoreOutsidePolicy.DeepOcean
    }),
    budget: Object.freeze({
      maxWidth: resolution,
      maxHeight: resolution,
      maxTexelCount: texelCount,
      maxAtlasByteLength: texelCount * 4
    })
  });
}

const enum OceanOwnershipKind {
  Dry = 0,
  Ocean = 1,
  OtherWater = 2
}

const OCEAN_NEIGHBORHOOD_HAS_OCEAN = 1;
const OCEAN_NEIGHBORHOOD_ALL_OCEAN = 2;

function compileOceanOwnershipKinds(oceanBodyId: string, context: WaterGenerationCompileContextV1): Uint8Array {
  const resolution = context.ownership.resolution;
  const kinds = new Uint8Array(resolution * resolution);
  for (let z = 0; z < resolution; z++) {
    for (let x = 0; x < resolution; x++) {
      const bodyIndex = context.ownership.sampleBodyIndex(x, z);
      if (bodyIndex === 0) continue;
      if (bodyIndex === 0xffff) {
        throw new Error(`Seed World Ocean refinement found INVALID Ownership at (${x}, ${z}).`);
      }
      kinds[z * resolution + x] =
        context.bodyIdForOwnerIndex(bodyIndex) === oceanBodyId
          ? OceanOwnershipKind.Ocean
          : OceanOwnershipKind.OtherWater;
    }
  }
  return kinds;
}

function sampleOceanOwnershipNeighborhood(
  kinds: Uint8Array,
  resolution: number,
  centerX: number,
  centerZ: number
): number {
  let hasOcean = false;
  let allOcean = true;
  for (let dz = -1; dz <= 1; dz++) {
    const z = centerZ + dz;
    if (z < 0 || z >= resolution) continue;
    for (let dx = -1; dx <= 1; dx++) {
      const x = centerX + dx;
      if (x < 0 || x >= resolution) continue;
      const ocean = kinds[z * resolution + x] === OceanOwnershipKind.Ocean;
      hasOcean ||= ocean;
      allOcean &&= ocean;
    }
  }
  return (hasOcean ? OCEAN_NEIGHBORHOOD_HAS_OCEAN : 0) | (allOcean ? OCEAN_NEIGHBORHOOD_ALL_OCEAN : 0);
}

function canSampleScopedHfinalSurface(
  dependencyTileIds: ReadonlySet<number>,
  context: WaterGenerationCompileContextV1,
  worldXOffsetMillimetres: number,
  worldZOffsetMillimetres: number
): boolean {
  const spacing = context.transform.hfinalSpacingMillimetres;
  const maximumVertex = context.transform.hfinalResolution - 1;
  const x0 = Math.min(maximumVertex, Math.max(0, Math.floor(worldXOffsetMillimetres / spacing)));
  const z0 = Math.min(maximumVertex, Math.max(0, Math.floor(worldZOffsetMillimetres / spacing)));
  const x1 = Math.min(maximumVertex, x0 + 1);
  const z1 = Math.min(maximumVertex, z0 + 1);
  const tileSizeX = context.transform.worldSizeXMillimetres / WATER_GENERATION_TERRAIN_TILE_AXIS_COUNT;
  const tileSizeZ = context.transform.worldSizeZMillimetres / WATER_GENERATION_TERRAIN_TILE_AXIS_COUNT;
  for (const [x, z] of [
    [x0, z0],
    [x1, z0],
    [x0, z1],
    [x1, z1]
  ] as const) {
    const tileX = Math.min(WATER_GENERATION_TERRAIN_TILE_AXIS_COUNT - 1, Math.floor((x * spacing) / tileSizeX));
    const tileZ = Math.min(WATER_GENERATION_TERRAIN_TILE_AXIS_COUNT - 1, Math.floor((z * spacing) / tileSizeZ));
    if (!dependencyTileIds.has(tileZ * WATER_GENERATION_TERRAIN_TILE_AXIS_COUNT + tileX)) return false;
  }
  return true;
}

function sampleScopedHfinalSurface(
  terrain: WaterGenerationScopedTerrainViewV1,
  context: WaterGenerationCompileContextV1,
  worldXOffsetMillimetres: number,
  worldZOffsetMillimetres: number
): Readonly<{ heightMetres: number; gradientX: number; gradientZ: number }> {
  const spacing = context.transform.hfinalSpacingMillimetres;
  const maximumVertex = context.transform.hfinalResolution - 1;
  const gridX = Math.min(maximumVertex, Math.max(0, worldXOffsetMillimetres / spacing));
  const gridZ = Math.min(maximumVertex, Math.max(0, worldZOffsetMillimetres / spacing));
  const x0 = Math.floor(gridX);
  const z0 = Math.floor(gridZ);
  const x1 = Math.min(maximumVertex, x0 + 1);
  const z1 = Math.min(maximumVertex, z0 + 1);
  const fractionX = gridX - x0;
  const fractionZ = gridZ - z0;
  const decode = (sample: number): number =>
    (context.hfinal.minimumHeightMillimetres +
      ((context.hfinal.maximumHeightMillimetres - context.hfinal.minimumHeightMillimetres) * sample) / 65_535) /
    1_000;
  const height00 = decode(terrain.sampleR16(x0, z0));
  const height10 = decode(terrain.sampleR16(x1, z0));
  const height01 = decode(terrain.sampleR16(x0, z1));
  const height11 = decode(terrain.sampleR16(x1, z1));
  const heightMetres =
    height00 * (1 - fractionX) * (1 - fractionZ) +
    height10 * fractionX * (1 - fractionZ) +
    height01 * (1 - fractionX) * fractionZ +
    height11 * fractionX * fractionZ;
  const spacingMetres = spacing / 1_000;
  const gradientX = ((height10 - height00) * (1 - fractionZ) + (height11 - height01) * fractionZ) / spacingMetres;
  const gradientZ = ((height01 - height00) * (1 - fractionX) + (height11 - height10) * fractionX) / spacingMetres;
  return Object.freeze({ heightMetres, gradientX, gradientZ });
}

function estimateHfinalSignedShoreDistanceMetres(
  waterLevel: number,
  terrain: Readonly<{ heightMetres: number; gradientX: number; gradientZ: number }>
): number {
  // First-order distance to the Hfinal y=waterLevel contour. A small slope
  // floor keeps flat deep-ocean samples finite; sign and the zero crossing are
  // still taken directly from the physical height difference.
  const minimumGradient = 1 / OCEAN_NEARSHORE_GPU_SHORE_DISTANCE_RANGE_MAXIMUM_METRES;
  return Math.max(
    -OCEAN_NEARSHORE_GPU_SHORE_DISTANCE_RANGE_MAXIMUM_METRES,
    Math.min(
      OCEAN_NEARSHORE_GPU_SHORE_DISTANCE_RANGE_MAXIMUM_METRES,
      (waterLevel - terrain.heightMetres) / Math.max(Math.hypot(terrain.gradientX, terrain.gradientZ), minimumGradient)
    )
  );
}

function retainBoundaryConnectedWetMask(candidate: Uint8Array, resolution: number): Uint8Array {
  const wet = new Uint8Array(candidate.length);
  const queue = new Uint32Array(candidate.length);
  let head = 0;
  let tail = 0;
  const enqueue = (x: number, z: number): void => {
    const index = z * resolution + x;
    if (candidate[index] === 0 || wet[index] !== 0) return;
    wet[index] = 1;
    queue[tail++] = index;
  };
  for (let coordinate = 0; coordinate < resolution; coordinate++) {
    enqueue(coordinate, 0);
    enqueue(coordinate, resolution - 1);
    enqueue(0, coordinate);
    enqueue(resolution - 1, coordinate);
  }
  while (head < tail) {
    const index = queue[head++]!;
    const x = index % resolution;
    const z = Math.floor(index / resolution);
    if (x > 0) enqueue(x - 1, z);
    if (x + 1 < resolution) enqueue(x + 1, z);
    if (z > 0) enqueue(x, z - 1);
    if (z + 1 < resolution) enqueue(x, z + 1);
  }
  return wet;
}

function compileLakeDescriptor(
  source: SeedWorldAuthoritativeLakeSourceV1,
  footprint: Readonly<CompiledWaterFootprintV1>,
  context: WaterGenerationCompileContextV1
): Readonly<HeightfieldWaterDescriptorV1> {
  const lakeSurface = footprint.lakeSurface;
  if (!lakeSurface) {
    throw new Error(`Lake '${source.bodyId}' has no basin-constrained Tile/Coverage surface.`);
  }
  if (
    Math.abs(SEED_WORLD_LAKE_RENDER_SURFACE_OFFSET_MILLIMETRES) > context.budget.maximumRenderSurfaceOffsetMillimetres
  ) {
    throw new Error(
      `Lake '${source.bodyId}' render surface offset ${SEED_WORLD_LAKE_RENDER_SURFACE_OFFSET_MILLIMETRES}mm exceeds the generation budget ${context.budget.maximumRenderSurfaceOffsetMillimetres}mm.`
    );
  }
  const records = footprintCells(footprint).filter(({ wet }) => wet);
  const ownershipCell = context.transform.ownershipCellMillimetres;
  const bounds = Object.freeze({
    minX: Math.max(
      0,
      Math.min(footprint.logicalBounds.minX, Math.floor(lakeSurface.boundsMillimetres.minX / ownershipCell))
    ),
    minZ: Math.max(
      0,
      Math.min(footprint.logicalBounds.minZ, Math.floor(lakeSurface.boundsMillimetres.minZ / ownershipCell))
    ),
    maxX: Math.min(
      context.transform.ownershipResolution,
      Math.max(footprint.logicalBounds.maxX, Math.ceil(lakeSurface.boundsMillimetres.maxX / ownershipCell))
    ),
    maxZ: Math.min(
      context.transform.ownershipResolution,
      Math.max(footprint.logicalBounds.maxZ, Math.ceil(lakeSurface.boundsMillimetres.maxZ / ownershipCell))
    )
  });
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxZ - bounds.minZ;
  const ordered = records
    .map((record) => ({
      index: (record.z - bounds.minZ) * width + record.x - bounds.minX,
      surfaceHeight: source.surfaceHeightMillimetres / 1_000,
      bedHeight: (source.surfaceHeightMillimetres - record.depthMillimetres) / 1_000
    }))
    .sort((left, right) => left.index - right.index);
  return Object.freeze({
    schemaVersion: HeightfieldWaterSchemaVersion.V1,
    id: source.bodyId,
    grid: Object.freeze({
      originXZ: Object.freeze([
        (context.transform.worldMinXMillimetres + (bounds.minX + 0.5) * ownershipCell) / 1_000,
        (context.transform.worldMinZMillimetres + (bounds.minZ + 0.5) * ownershipCell) / 1_000
      ] as const),
      cellSizeXZ: Object.freeze([ownershipCell / 1_000, ownershipCell / 1_000] as const),
      width,
      height
    }),
    wetTexelIndices: Uint32Array.from(ordered, ({ index }) => index),
    surfaceHeights: Float32Array.from(ordered, ({ surfaceHeight }) => surfaceHeight),
    bedHeights: Float32Array.from(ordered, ({ bedHeight }) => bedHeight),
    renderSurface: Object.freeze({
      topology: "triangle-list" as const,
      triangleVertices: Float32Array.from(lakeSurface.triangleVerticesMillimetres, (value, index) =>
        index % 3 === 1
          ? (value + SEED_WORLD_LAKE_RENDER_SURFACE_OFFSET_MILLIMETRES) / 1_000
          : index % 3 === 0
            ? (context.transform.worldMinXMillimetres + value) / 1_000
            : (context.transform.worldMinZMillimetres + value) / 1_000
      ),
      coverage: Object.freeze({
        kind: "basin-constrained-terrain-height" as const,
        grid: Object.freeze({
          originXZ: Object.freeze([
            (context.transform.worldMinXMillimetres + lakeSurface.coverage.boundsMillimetres.minX) / 1_000 +
              (lakeSurface.coverage.boundsMillimetres.maxX - lakeSurface.coverage.boundsMillimetres.minX) /
                lakeSurface.coverage.width /
                2_000,
            (context.transform.worldMinZMillimetres + lakeSurface.coverage.boundsMillimetres.minZ) / 1_000 +
              (lakeSurface.coverage.boundsMillimetres.maxZ - lakeSurface.coverage.boundsMillimetres.minZ) /
                lakeSurface.coverage.height /
                2_000
          ] as const),
          cellSizeXZ: Object.freeze([
            (lakeSurface.coverage.boundsMillimetres.maxX - lakeSurface.coverage.boundsMillimetres.minX) /
              lakeSurface.coverage.width /
              1_000,
            (lakeSurface.coverage.boundsMillimetres.maxZ - lakeSurface.coverage.boundsMillimetres.minZ) /
              lakeSurface.coverage.height /
              1_000
          ] as const),
          width: lakeSurface.coverage.width,
          height: lakeSurface.coverage.height
        }),
        basinSupport: new Uint8Array(lakeSurface.coverage.basinSupport),
        terrainHeights: Float32Array.from(
          lakeSurface.coverage.terrainHeightsMillimetres,
          (heightMillimetres) => heightMillimetres / 1_000
        ),
        waterLevel:
          (lakeSurface.coverage.waterLevelMillimetres + SEED_WORLD_LAKE_RENDER_SURFACE_OFFSET_MILLIMETRES) / 1_000,
        minimumVisibleDepth: lakeSurface.coverage.minimumVisibleDepthMillimetres / 1_000
      })
    }),
    waveAsset: Object.freeze({ schemaVersion: WaterWaveSchemaVersion.V1, model: WaterWaveModel.None }),
    quality: WaterQualityTier.Medium,
    surfaceMotion: LAKE_WATER_SURFACE_MOTION,
    spatialField: LAKE_WATER_SPATIAL_FIELD
  });
}

function footprintCells(footprint: Readonly<CompiledWaterFootprintV1>): readonly Readonly<{
  x: number;
  z: number;
  wet: boolean;
  depthMillimetres: number;
}>[] {
  const cells: Array<{ x: number; z: number; wet: boolean; depthMillimetres: number }> = [];
  for (const tile of footprint.tiles) {
    const tileX = tile.terrainTileId % 96;
    const tileZ = Math.floor(tile.terrainTileId / 96);
    for (let localZ = 0; localZ < tile.cellWidth; localZ++) {
      for (let localX = 0; localX < tile.cellWidth; localX++) {
        const localIndex = localZ * tile.cellWidth + localX;
        cells.push({
          x: tileX * tile.cellWidth + localX,
          z: tileZ * tile.cellWidth + localZ,
          wet: tile.wetMask[localIndex] === 1,
          depthMillimetres: tile.depthMillimetres[localIndex]!
        });
      }
    }
  }
  return Object.freeze(cells.map((cell) => Object.freeze(cell)));
}

function readAuthoritativeWaterDescriptor(
  source: WaterBodySourceV1
): SeedWorldAuthoritativeWaterSourceDescriptorV1 | undefined {
  const descriptor = "descriptor" in source ? source.descriptor : undefined;
  if (typeof descriptor !== "object" || descriptor === null || !("authoritativeKind" in descriptor)) return undefined;
  const kind = (descriptor as Readonly<{ authoritativeKind?: unknown }>).authoritativeKind;
  if (kind !== "lake-basin-coverage-v1" && kind !== "ocean-boundary-connected-v1") {
    return undefined;
  }
  return descriptor as SeedWorldAuthoritativeWaterSourceDescriptorV1;
}
