import { HeightfieldWaterSchemaVersion } from "../../authoring/heightfield/HeightfieldWaterEnums";
import type { HeightfieldWaterDescriptorV1 } from "../../authoring/heightfield/HeightfieldWaterDescriptor";
import { WaterWaveModel } from "../../authoring/wave/enums/WaterWaveModel";
import { WaterWaveSchemaVersion } from "../../authoring/wave/enums/WaterWaveSchemaVersion";
import { HeightfieldWaterCompiler } from "../../compiler/heightfield/HeightfieldWaterCompiler";
import { hashStableValue } from "../../compiler/shared/determinism";
import {
  GRASSLANDS_CAMERA_FIXTURE,
  GRASSLANDS_CANDIDATE_VALIDATION_ROIS,
  GRASSLANDS_CAPTURE_VIEWPORT,
  GRASSLANDS_COMPILED_SURFACE_APPEARANCE,
  GRASSLANDS_DIRECT_LIGHT_FIXTURE,
  GRASSLANDS_HEIGHTFIELD_DESCRIPTOR_ID,
  GRASSLANDS_HEIGHTFIELD_PLACEHOLDER_MATERIAL,
  GRASSLANDS_MECHANISM_ROIS,
  GRASSLANDS_NORMAL_CONTENT_HASH,
  GRASSLANDS_PCG_DEFAULT_SEED,
  GRASSLANDS_PCG_FIXTURE_ID,
  GRASSLANDS_PCG_PRESET,
  GRASSLANDS_SCENE_MATERIALS,
  GRASSLANDS_TARGET_MATERIAL_CONFIG,
  GRASSLANDS_TERRAIN_RECIPE,
  GRASSLANDS_WATER_BOUNDS,
  GRASSLANDS_WATER_GRID,
  GRASSLANDS_WORLD_SCALE
} from "./GrasslandsPcgPreset";
import type {
  GrasslandsAnchorRockFixture,
  GrasslandsDecorationFixture,
  GrasslandsPcgFixture,
  GrasslandsScenicRockFixture,
  GrasslandsVector3
} from "./GrasslandsPcgTypes";
import { sampleGrasslandsTerrainProfile } from "./GrasslandsTerrainModel";

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
    [-8.1, -0.25 * GRASSLANDS_WORLD_SCALE, 17],
    [1.4 * GRASSLANDS_WORLD_SCALE, 0.9 * GRASSLANDS_WORLD_SCALE, 1.1 * GRASSLANDS_WORLD_SCALE]
  ),
  createAnchorRock(
    "anchor-rock-right-bank",
    [13, -0.35 * GRASSLANDS_WORLD_SCALE, 17],
    [1.5 * GRASSLANDS_WORLD_SCALE, 1.05 * GRASSLANDS_WORLD_SCALE, 1.25 * GRASSLANDS_WORLD_SCALE]
  ),
  createAnchorRock(
    "anchor-rock-channel",
    [3.8, -0.45 * GRASSLANDS_WORLD_SCALE, -18],
    [1.1 * GRASSLANDS_WORLD_SCALE, 0.7 * GRASSLANDS_WORLD_SCALE, 0.9 * GRASSLANDS_WORLD_SCALE]
  )
]);

function createScenicRock(
  id: string,
  kind: GrasslandsScenicRockFixture["kind"],
  position: GrasslandsVector3,
  halfExtents: GrasslandsVector3
): GrasslandsScenicRockFixture {
  return Object.freeze({
    id,
    kind,
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
    validationCritical: false
  });
}

const GRASSLANDS_SCENIC_ROCKS: readonly GrasslandsScenicRockFixture[] = Object.freeze([
  createScenicRock("scenic-rock-bed-shoal-center", "underwater-bed", [0, -0.52, 31], [0.8, 0.32, 0.6]),
  createScenicRock("scenic-rock-bed-shoal-left", "underwater-bed", [-6, -0.58, 27], [0.65, 0.3, 0.5]),
  createScenicRock("scenic-rock-bed-shoal-right", "underwater-bed", [7, -0.68, 24], [0.7, 0.34, 0.55]),
  createScenicRock("scenic-rock-bed-shoal-back", "underwater-bed", [0, -0.78, 18], [0.58, 0.3, 0.48]),
  createScenicRock("scenic-rock-bed-bay-left", "underwater-bed", [-4, -1.08, 5], [0.7, 0.42, 0.55]),
  createScenicRock("scenic-rock-bed-bay-right", "underwater-bed", [4, -1.12, -2], [0.62, 0.38, 0.5]),
  createScenicRock("scenic-rock-bed-channel", "underwater-bed", [-1, -1.18, -16], [0.52, 0.28, 0.42]),
  createScenicRock("scenic-rock-bed-far-river", "underwater-bed", [-7, -1.26, -28], [0.48, 0.25, 0.38]),
  createScenicRock("scenic-rock-shore-left-shoal", "shore", [-17.1, 0.72, 30], [0.9, 0.42, 0.65]),
  createScenicRock("scenic-rock-shore-right-shoal", "shore", [15.2, 0.65, 29], [0.8, 0.38, 0.6]),
  createScenicRock("scenic-rock-shore-right-bend", "shore", [21.2, 0.68, 23], [0.82, 0.4, 0.62]),
  createScenicRock("scenic-rock-shore-left-bay", "shore", [-19.2, 0.7, 1], [0.78, 0.38, 0.58]),
  createScenicRock("scenic-rock-shore-right-bay", "shore", [14.8, 0.64, -7], [0.72, 0.34, 0.54]),
  createScenicRock("scenic-rock-shore-left-channel", "shore", [-5.6, 0.58, -18], [0.62, 0.3, 0.48]),
  createScenicRock("scenic-rock-shore-left-far", "shore", [-13.2, 0.55, -29], [0.58, 0.28, 0.44])
]);

function createDecorations(seed: number): readonly GrasslandsDecorationFixture[] {
  const random = createRandom(seed);
  return Object.freeze(
    Array.from({ length: DECORATION_COUNT }, (_value, index) => {
      const bankSign = index % 2 === 0 ? -1 : 1;
      const z = -32 + random() * 66;
      const profile = sampleGrasslandsTerrainProfile(GRASSLANDS_TERRAIN_RECIPE, z);
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

function createDescriptor(): HeightfieldWaterDescriptorV1 {
  const { width, height, cellSize, surfaceHeight, authoredBedHeight } = GRASSLANDS_WATER_GRID;
  const wetTexelCount = width * height;
  const wetTexelIndices = Uint32Array.from({ length: wetTexelCount }, (_value, index) => index);
  const surfaceHeights = new Float32Array(wetTexelCount);
  surfaceHeights.fill(surfaceHeight);
  const bedHeights = new Float32Array(wetTexelCount);
  bedHeights.fill(authoredBedHeight);
  const flowVectorsXZ = new Float32Array(wetTexelCount * 2);

  return {
    schemaVersion: HeightfieldWaterSchemaVersion.V1,
    id: GRASSLANDS_HEIGHTFIELD_DESCRIPTOR_ID,
    grid: {
      originXZ: [
        GRASSLANDS_WATER_BOUNDS.minimum[0] + cellSize * 0.5,
        GRASSLANDS_WATER_BOUNDS.minimum[2] + cellSize * 0.5
      ],
      cellSizeXZ: [cellSize, cellSize],
      width,
      height
    },
    wetTexelIndices,
    surfaceHeights,
    bedHeights,
    flowVectorsXZ,
    waveAsset: {
      schemaVersion: WaterWaveSchemaVersion.V1,
      model: WaterWaveModel.None
    },
    quality: GRASSLANDS_PCG_PRESET.quality,
    material: GRASSLANDS_HEIGHTFIELD_PLACEHOLDER_MATERIAL
  };
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
  const descriptor = createDescriptor();
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
    appearanceAssetId: GRASSLANDS_COMPILED_SURFACE_APPEARANCE.sourceId,
    appearanceHash: GRASSLANDS_COMPILED_SURFACE_APPEARANCE.appearanceHash,
    appearanceVariantKey: GRASSLANDS_COMPILED_SURFACE_APPEARANCE.variantKey,
    externalAssetHash: GRASSLANDS_NORMAL_CONTENT_HASH,
    targetMaterialConfig: GRASSLANDS_TARGET_MATERIAL_CONFIG,
    waterBounds: GRASSLANDS_WATER_BOUNDS,
    camera: GRASSLANDS_CAMERA_FIXTURE,
    directLight: GRASSLANDS_DIRECT_LIGHT_FIXTURE,
    captureViewport: GRASSLANDS_CAPTURE_VIEWPORT,
    mechanismRois: GRASSLANDS_MECHANISM_ROIS,
    candidateValidationRois: GRASSLANDS_CANDIDATE_VALIDATION_ROIS,
    terrain: GRASSLANDS_TERRAIN_RECIPE,
    sceneMaterials: GRASSLANDS_SCENE_MATERIALS,
    anchorRocks: GRASSLANDS_ANCHOR_ROCKS,
    scenicRocks: GRASSLANDS_SCENIC_ROCKS,
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
    scenicRocks: fixture.scenicRocks,
    decorations: fixture.decorations,
    gameplayQueryRegistered: fixture.gameplayQueryRegistered,
    descriptor: {
      schemaVersion: fixture.descriptor.schemaVersion,
      id: fixture.descriptor.id,
      grid: fixture.descriptor.grid,
      wetTexelIndices: Array.from(fixture.descriptor.wetTexelIndices),
      surfaceHeights: Array.from(fixture.descriptor.surfaceHeights),
      bedHeights: fixture.descriptor.bedHeights ? Array.from(fixture.descriptor.bedHeights) : undefined,
      flowVectorsXZ: fixture.descriptor.flowVectorsXZ ? Array.from(fixture.descriptor.flowVectorsXZ) : undefined,
      waveAsset: fixture.descriptor.waveAsset,
      quality: fixture.descriptor.quality,
      material: fixture.descriptor.material
    }
  });
}
