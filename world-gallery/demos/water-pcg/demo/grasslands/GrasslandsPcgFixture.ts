import { HeightfieldWaterSchemaVersion } from "../../authoring/heightfield/HeightfieldWaterEnums";
import type { HeightfieldWaterDescriptorV1 } from "../../authoring/heightfield/HeightfieldWaterDescriptor";
import { WaterWaveModel } from "../../authoring/wave/enums/WaterWaveModel";
import { WaterWaveSchemaVersion } from "../../authoring/wave/enums/WaterWaveSchemaVersion";
import { HeightfieldWaterCompiler } from "../../compiler/heightfield/HeightfieldWaterCompiler";
import { hashStableValue } from "../../compiler/shared/determinism";
import {
  GRASSLANDS_CAMERA_FIXTURE,
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
    [-5.8, -0.25 * GRASSLANDS_WORLD_SCALE, 4.5],
    [1.4 * GRASSLANDS_WORLD_SCALE, 0.9 * GRASSLANDS_WORLD_SCALE, 1.1 * GRASSLANDS_WORLD_SCALE]
  ),
  createAnchorRock(
    "anchor-rock-right-bank",
    [11 * GRASSLANDS_WORLD_SCALE, -0.35 * GRASSLANDS_WORLD_SCALE, 4.5],
    [1.5 * GRASSLANDS_WORLD_SCALE, 1.05 * GRASSLANDS_WORLD_SCALE, 1.25 * GRASSLANDS_WORLD_SCALE]
  ),
  createAnchorRock(
    "anchor-rock-channel",
    [2 * GRASSLANDS_WORLD_SCALE, -0.45 * GRASSLANDS_WORLD_SCALE, -8 * GRASSLANDS_WORLD_SCALE],
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
  createScenicRock("scenic-rock-bed-foreground", "underwater-bed", [-2.8, -0.9, 7.2], [1.1, 0.55, 0.75]),
  createScenicRock("scenic-rock-bed-mid", "underwater-bed", [2.4, -1.05, 2.2], [0.8, 0.4, 0.6]),
  createScenicRock("scenic-rock-bed-far", "underwater-bed", [-1.4, -1.15, -5.3], [0.65, 0.3, 0.5]),
  createScenicRock("scenic-rock-shore-left-foreground", "shore", [-8.5, 1, 5.8], [0.9, 0.45, 0.65]),
  createScenicRock("scenic-rock-shore-right-foreground", "shore", [8.7, 0.6, 3], [0.8, 0.4, 0.6]),
  createScenicRock("scenic-rock-shore-left-mid", "shore", [-7.2, 1.07, 1], [0.75, 0.35, 0.55]),
  createScenicRock("scenic-rock-shore-right-mid", "shore", [5.8, 0.76, -1.5], [0.65, 0.3, 0.5])
]);

function createDecorations(seed: number): readonly GrasslandsDecorationFixture[] {
  const random = createRandom(seed);
  return Object.freeze(
    Array.from({ length: DECORATION_COUNT }, (_value, index) => {
      const bankSign = index % 2 === 0 ? -1 : 1;
      const distanceFromCenter = (30 + random() * 7) * GRASSLANDS_WORLD_SCALE;
      const z = (-20 + random() * 40) * GRASSLANDS_WORLD_SCALE;
      const scale = (0.75 + random() * 0.5) * GRASSLANDS_WORLD_SCALE;
      return Object.freeze({
        id: `bank-tuft-${index}`,
        kind: "bank-tuft" as const,
        position: Object.freeze([bankSign * distanceFromCenter, 0.25 * GRASSLANDS_WORLD_SCALE, z] as const),
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
