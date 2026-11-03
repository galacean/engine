import { createLake, WaterWaveModel, WaterWaveSchemaVersion } from "@galacean/engine-water/water/index";
import type { LakeSplinePoint, HeightfieldWaterDescriptorV1 } from "@galacean/engine-water/water/index";

import { HeightfieldWaterCompiler, hashStableValue } from "@galacean/engine-water/water/compiler/index";

import {
  GRASSLANDS_CAMERA_FIXTURE,
  GRASSLANDS_CANDIDATE_VALIDATION_ROIS,
  GRASSLANDS_CAPTURE_VIEWPORT,
  GRASSLANDS_DIRECT_LIGHT_FIXTURE,
  GRASSLANDS_HEIGHTFIELD_DESCRIPTOR_ID,
  GRASSLANDS_HEIGHTFIELD_SPATIAL_FIELD,
  GRASSLANDS_HEIGHTFIELD_SURFACE_MOTION,
  GRASSLANDS_MECHANISM_ROIS,
  GRASSLANDS_PCG_DEFAULT_SEED,
  GRASSLANDS_PCG_FIXTURE_ID,
  GRASSLANDS_PCG_PRESET,
  GRASSLANDS_SCENE_MATERIALS,
  GRASSLANDS_TARGET_MATERIAL_CONFIG,
  GRASSLANDS_LAKE_TERRAIN_RECIPE,
  GRASSLANDS_WATER_BOUNDS,
  GRASSLANDS_WATER_GRID,
  GRASSLANDS_WORLD_SCALE
} from "./GrasslandsPcgPreset.ts";
import { LAKE_NORMAL_CONTENT_HASH } from "@galacean/engine-water/water/resources/lake/index";
import { LAKE_COMPILED_SURFACE_APPEARANCE_V2 } from "@galacean/engine-water/water/presets/lake/index";
import type {
  GrasslandsAnchorRockFixture,
  GrasslandsDecorationFixture,
  GrasslandsPcgFixture,
  GrasslandsVector3
} from "./GrasslandsPcgTypes.ts";
import { sampleGrasslandsTerrainModelHeight, sampleGrasslandsTerrainProfile } from "./GrasslandsTerrainModel.ts";

const UINT32_MAX = 0xffff_ffff;
const DECORATION_COUNT = 8;

function requireSeed(seed: number): number {
  if (!Number.isInteger(seed) || seed < 0 || seed > UINT32_MAX) {
    throw new RangeError("Grasslands PCG seed must be an unsigned 32-bit integer.");
  }
  return seed;
}

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

function createAnchorRock(
  id: string,
  position: GrasslandsVector3,
  halfExtents: GrasslandsVector3
): GrasslandsAnchorRockFixture {
  return Object.freeze({
    id,
    position: Object.freeze(position),
    halfExtents: Object.freeze(halfExtents),
    bounds: Object.freeze({
      minimum: Object.freeze([
        position[0] - halfExtents[0],
        position[1] - halfExtents[1],
        position[2] - halfExtents[2]
      ] as const),
      maximum: Object.freeze([
        position[0] + halfExtents[0],
        position[1] + halfExtents[1],
        position[2] + halfExtents[2]
      ] as const)
    }),
    validationCritical: true
  });
}

const GRASSLANDS_ANCHOR_ROCKS: readonly GrasslandsAnchorRockFixture[] = Object.freeze([
  createAnchorRock(
    "anchor-rock-left-foreground",
    [-12, -0.25 * GRASSLANDS_WORLD_SCALE, 15],
    [1.4 * GRASSLANDS_WORLD_SCALE, 0.9 * GRASSLANDS_WORLD_SCALE, 1.1 * GRASSLANDS_WORLD_SCALE]
  ),
  createAnchorRock(
    "anchor-rock-right-bank",
    [23, -0.35 * GRASSLANDS_WORLD_SCALE, 7],
    [1.5 * GRASSLANDS_WORLD_SCALE, 1.05 * GRASSLANDS_WORLD_SCALE, 1.25 * GRASSLANDS_WORLD_SCALE]
  ),
  createAnchorRock(
    "anchor-rock-channel",
    [-16, -0.45 * GRASSLANDS_WORLD_SCALE, -13],
    [1.1 * GRASSLANDS_WORLD_SCALE, 0.7 * GRASSLANDS_WORLD_SCALE, 0.9 * GRASSLANDS_WORLD_SCALE]
  )
]);

function createDecorations(seed: number): readonly GrasslandsDecorationFixture[] {
  const random = createRandom(seed);
  return Object.freeze(
    Array.from({ length: DECORATION_COUNT }, (_value, index) => {
      const bankSign = index % 2 === 0 ? -1 : 1;
      const z = -32 + random() * 66;
      const profile = sampleGrasslandsTerrainProfile(GRASSLANDS_LAKE_TERRAIN_RECIPE, z);
      const shoreX = bankSign < 0 ? profile.leftShoreX : profile.rightShoreX;
      const x = shoreX + bankSign * (2.5 + random() * 2);
      const scale = (0.75 + random() * 0.5) * GRASSLANDS_WORLD_SCALE;
      return Object.freeze({
        id: `bank-tuft-${index}`,
        kind: "bank-tuft" as const,
        position: Object.freeze([x, 0.25 * GRASSLANDS_WORLD_SCALE, z] as const),
        scale,
        validationCritical: false as const
      });
    })
  );
}

function createEllipseShoreline(): LakeSplinePoint[] {
  const controlPoints: LakeSplinePoint[] = [];
  // Eight cubic arcs approximate the ellipse, with shared tangents at each control point.
  const [radiusX, radiusZ] = GRASSLANDS_LAKE_TERRAIN_RECIPE.ellipse!.radiusXZ;
  const controlPointCount = 8;
  const angleStep = (Math.PI * 2) / controlPointCount;
  const handleScale = (4 / 3) * Math.tan(angleStep / 4);
  for (let i = 0; i < controlPointCount; i++) {
    const angle = i * angleStep;
    const x = radiusX * Math.cos(angle),
      z = radiusZ * Math.sin(angle);
    const tangentX = -radiusX * Math.sin(angle) * handleScale,
      tangentZ = radiusZ * Math.cos(angle) * handleScale;
    controlPoints.push({
      position: [x, z],
      incoming: [x - tangentX, z - tangentZ],
      outgoing: [x + tangentX, z + tangentZ]
    });
  }
  return controlPoints;
}

function createLakeDescriptor(): HeightfieldWaterDescriptorV1 {
  const { width, height, cellSize, surfaceHeight } = GRASSLANDS_WATER_GRID;
  const gridSampleCount = width * height;
  const bedHeights = new Float32Array(gridSampleCount);
  for (let index = 0; index < gridSampleCount; index++) {
    const x = GRASSLANDS_WATER_BOUNDS.minimum[0] + ((index % width) + 0.5) * cellSize;
    const z = GRASSLANDS_WATER_BOUNDS.minimum[2] + (Math.floor(index / width) + 0.5) * cellSize;
    bedHeights[index] = Math.min(
      surfaceHeight,
      sampleGrasslandsTerrainModelHeight(GRASSLANDS_LAKE_TERRAIN_RECIPE, x, z)
    );
  }

  return createLake({
    id: GRASSLANDS_HEIGHTFIELD_DESCRIPTOR_ID,
    boundary: {
      schemaVersion: 1,
      waterLevel: surfaceHeight,
      rings: [createEllipseShoreline()],
      maxChordError: 0.025,
      maxSegmentLength: 2
    },
    grid: {
      originXZ: [
        GRASSLANDS_WATER_BOUNDS.minimum[0] + cellSize * 0.5,
        GRASSLANDS_WATER_BOUNDS.minimum[2] + cellSize * 0.5
      ],
      cellSizeXZ: [cellSize, cellSize],
      width,
      height
    },
    bedHeights,
    waveAsset: {
      schemaVersion: WaterWaveSchemaVersion.V1,
      model: WaterWaveModel.None
    },
    quality: GRASSLANDS_PCG_PRESET.quality,
    surfaceMotion: GRASSLANDS_HEIGHTFIELD_SURFACE_MOTION,
    spatialField: GRASSLANDS_HEIGHTFIELD_SPATIAL_FIELD
  });
}

function compileDescriptorHash(descriptor: HeightfieldWaterDescriptorV1): string {
  const result = HeightfieldWaterCompiler.compile(descriptor);
  if (!result.valid || !result.data) {
    const diagnostic = result.diagnostics.map(({ path, message }) => `${path}: ${message}`).join("; ");
    throw new Error(`Grasslands Heightfield descriptor failed validation: ${diagnostic}`);
  }
  return result.data.sourceHash;
}

/** Builds the pure-data M2A fixture. No Engine, GPU, loader, or WaterWorld object is created. */
export function createGrasslandsPcgFixture(seed = GRASSLANDS_PCG_DEFAULT_SEED): GrasslandsPcgFixture {
  const normalizedSeed = requireSeed(seed);
  const descriptor = createLakeDescriptor();
  const descriptorHash = compileDescriptorHash(descriptor);
  const decorations = createDecorations(normalizedSeed);
  const fixtureIdentity = {
    schemaVersion: 1,
    fixtureId: GRASSLANDS_PCG_FIXTURE_ID,
    seed: normalizedSeed,
    caseId: GRASSLANDS_PCG_PRESET.caseId,
    runtime: GRASSLANDS_PCG_PRESET.runtime,
    preset: GRASSLANDS_PCG_PRESET.preset,
    waterBodyType: GRASSLANDS_PCG_PRESET.waterBodyType,
    descriptorHash,
    appearanceAssetId: LAKE_COMPILED_SURFACE_APPEARANCE_V2.sourceId,
    appearanceHash: LAKE_COMPILED_SURFACE_APPEARANCE_V2.appearanceHash,
    appearanceVariantKey: LAKE_COMPILED_SURFACE_APPEARANCE_V2.variantKey,
    externalAssetHash: LAKE_NORMAL_CONTENT_HASH,
    targetMaterialConfig: GRASSLANDS_TARGET_MATERIAL_CONFIG,
    waterBounds: GRASSLANDS_WATER_BOUNDS,
    camera: GRASSLANDS_CAMERA_FIXTURE,
    directLight: GRASSLANDS_DIRECT_LIGHT_FIXTURE,
    captureViewport: GRASSLANDS_CAPTURE_VIEWPORT,
    mechanismRois: GRASSLANDS_MECHANISM_ROIS,
    candidateValidationRois: GRASSLANDS_CANDIDATE_VALIDATION_ROIS,
    terrain: GRASSLANDS_LAKE_TERRAIN_RECIPE,
    sceneMaterials: GRASSLANDS_SCENE_MATERIALS,
    anchorRocks: GRASSLANDS_ANCHOR_ROCKS,
    decorations,
    gameplayQueryRegistered: false
  } as const;

  return Object.freeze({
    ...fixtureIdentity,
    descriptor,
    fixtureHash: hashStableValue(fixtureIdentity),
    wetTexelCount: descriptor.wetTexelIndices.length
  });
}

/** Stable JSON evidence format for the otherwise typed-array-based Heightfield V1 descriptor. */
export function serializeGrasslandsPcgFixture(fixture: GrasslandsPcgFixture): string {
  return JSON.stringify({
    schemaVersion: fixture.schemaVersion,
    fixtureId: fixture.fixtureId,
    seed: fixture.seed,
    caseId: fixture.caseId,
    runtime: fixture.runtime,
    preset: fixture.preset,
    waterBodyType: fixture.waterBodyType,
    descriptorHash: fixture.descriptorHash,
    appearanceAssetId: fixture.appearanceAssetId,
    appearanceHash: fixture.appearanceHash,
    appearanceVariantKey: fixture.appearanceVariantKey,
    externalAssetHash: fixture.externalAssetHash,
    targetMaterialConfig: fixture.targetMaterialConfig,
    fixtureHash: fixture.fixtureHash,
    waterBounds: fixture.waterBounds,
    wetTexelCount: fixture.wetTexelCount,
    camera: fixture.camera,
    directLight: fixture.directLight,
    captureViewport: fixture.captureViewport,
    mechanismRois: fixture.mechanismRois,
    candidateValidationRois: fixture.candidateValidationRois,
    terrain: fixture.terrain,
    sceneMaterials: fixture.sceneMaterials,
    anchorRocks: fixture.anchorRocks,
    decorations: fixture.decorations,
    gameplayQueryRegistered: fixture.gameplayQueryRegistered,
    descriptor: {
      schemaVersion: fixture.descriptor.schemaVersion,
      id: fixture.descriptor.id,
      grid: fixture.descriptor.grid,
      lakeBoundary: fixture.descriptor.lakeBoundary,
      wetTexelIndices: Array.from(fixture.descriptor.wetTexelIndices),
      surfaceHeights: Array.from(fixture.descriptor.surfaceHeights),
      bedHeights: fixture.descriptor.bedHeights ? Array.from(fixture.descriptor.bedHeights) : undefined,
      flowVectorsXZ: fixture.descriptor.flowVectorsXZ ? Array.from(fixture.descriptor.flowVectorsXZ) : undefined,
      waveAsset: fixture.descriptor.waveAsset,
      quality: fixture.descriptor.quality,
      surfaceMotion: fixture.descriptor.surfaceMotion,
      spatialField: fixture.descriptor.spatialField
    }
  });
}
