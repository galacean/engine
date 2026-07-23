import { HeightfieldWaterSchemaVersion } from "../../../authoring/heightfield/HeightfieldWaterEnums";
import type { HeightfieldWaterDescriptorV1 } from "../../../authoring/heightfield/HeightfieldWaterDescriptor";
import { WaterQualityTier } from "../../../authoring/wave/enums/WaterQualityTier";
import { WaterWaveModel } from "../../../authoring/wave/enums/WaterWaveModel";
import { WaterWaveSchemaVersion } from "../../../authoring/wave/enums/WaterWaveSchemaVersion";
import {
  WATER_OPTICS_LAB_DEPTHS,
  WATER_OPTICS_LAB_ID,
  WATER_OPTICS_LAB_LENGTH,
  WATER_OPTICS_LAB_SURFACE_Y,
  WATER_OPTICS_LAB_WIDTH
} from "./constants";
import {
  WATER_OPTICS_PLANAR_ANCHOR_COLOR,
  WATER_OPTICS_PLANAR_ANCHOR_ID,
  WATER_OPTICS_PLANAR_ANCHOR_POSITION,
  WATER_OPTICS_PLANAR_ANCHOR_SIZE
} from "./WaterOpticsPlanarAnchorReference";
import type { WaterOpticsPlanarOrientation, WaterOpticsTier } from "./types";

export interface WaterOpticsLabRoi {
  readonly id:
    | "shallow-bed"
    | "medium-bed"
    | "deep-bed"
    | "foreground-rail"
    | "column-red-above"
    | "column-green-above"
    | "column-blue-above"
    | "planar-clip";
  readonly normalizedRect: readonly [number, number, number, number];
}

export interface WaterOpticsLabTargetDefinition {
  readonly id: string;
  readonly kind:
    | "column"
    | "underwater-sentinel"
    | "reflection-tower"
    | "foreground-rail"
    | "orientation-marker"
    | "planar-anchor";
  readonly position: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly color: readonly [number, number, number, number];
}

export interface WaterOpticsPlanarOrientationMarkerDefinition extends WaterOpticsLabTargetDefinition {
  readonly kind: "orientation-marker";
  readonly orientation: WaterOpticsPlanarOrientation;
}

export interface WaterOpticsLabFixture {
  readonly descriptor: HeightfieldWaterDescriptorV1;
  readonly tier: WaterOpticsTier;
  readonly targets: readonly WaterOpticsLabTargetDefinition[];
  readonly rois: readonly WaterOpticsLabRoi[];
}

/** Fixed asymmetric mirror references used by both the visible Demo and CPU projection Gates. */
export const WATER_OPTICS_PLANAR_ORIENTATION_MARKERS: Readonly<
  Record<WaterOpticsPlanarOrientation, Readonly<WaterOpticsPlanarOrientationMarkerDefinition>>
> = Object.freeze({
  left: Object.freeze({
    id: "orientation-left-red",
    kind: "orientation-marker",
    orientation: "left",
    position: [-10.7, 2.1, -5.5] as const,
    size: [0.7, 4.2, 0.7] as const,
    color: [0.94, 0.08, 0.04, 1] as const
  }),
  right: Object.freeze({
    id: "orientation-right-cyan",
    kind: "orientation-marker",
    orientation: "right",
    position: [10.7, 3.1, -5.5] as const,
    size: [0.7, 6.2, 0.7] as const,
    color: [0.02, 0.9, 0.95, 1] as const
  }),
  up: Object.freeze({
    id: "orientation-up-yellow",
    kind: "orientation-marker",
    orientation: "up",
    position: [2.8, 5.7, -6.2] as const,
    size: [1.15, 1.15, 1.15] as const,
    color: [1, 0.68, 0.015, 1] as const
  }),
  down: Object.freeze({
    id: "orientation-down-violet",
    kind: "orientation-marker",
    orientation: "down",
    position: [-1.8, 0.85, -4.4] as const,
    size: [2.1, 1.1, 0.8] as const,
    color: [0.66, 0.08, 1, 1] as const
  })
});

export const WATER_OPTICS_LAB_TARGETS: readonly WaterOpticsLabTargetDefinition[] = Object.freeze([
  Object.freeze({
    id: "column-red",
    kind: "column",
    position: [-6, 0, -1] as const,
    size: [0.7, 5, 0.7] as const,
    color: [0.88, 0.06, 0.04, 1] as const
  }),
  Object.freeze({
    id: "column-green",
    kind: "column",
    position: [0, 0, -1] as const,
    size: [0.7, 5, 0.7] as const,
    color: [0.04, 0.82, 0.13, 1] as const
  }),
  Object.freeze({
    id: "column-blue",
    kind: "column",
    position: [6, 0, -1] as const,
    size: [0.7, 5, 0.7] as const,
    color: [0.04, 0.18, 0.96, 1] as const
  }),
  Object.freeze({
    id: "underwater-magenta",
    kind: "underwater-sentinel",
    position: [4, -2, 10.5] as const,
    size: [3.5, 3, 1] as const,
    color: [1, 0.01, 0.72, 1] as const
  }),
  Object.freeze({
    id: "reflection-tower",
    kind: "reflection-tower",
    position: [-3.5, 3.4, -8.4] as const,
    size: [1.8, 6.8, 1.8] as const,
    color: [0.96, 0.82, 0.08, 1] as const
  }),
  Object.freeze({
    id: "foreground-rail",
    kind: "foreground-rail",
    position: [0, 2.2, 8.8] as const,
    size: [17, 0.32, 0.32] as const,
    color: [0.012, 0.012, 0.014, 1] as const
  }),
  WATER_OPTICS_PLANAR_ORIENTATION_MARKERS.left,
  WATER_OPTICS_PLANAR_ORIENTATION_MARKERS.right,
  WATER_OPTICS_PLANAR_ORIENTATION_MARKERS.up,
  WATER_OPTICS_PLANAR_ORIENTATION_MARKERS.down,
  Object.freeze({
    id: WATER_OPTICS_PLANAR_ANCHOR_ID,
    kind: "planar-anchor",
    position: WATER_OPTICS_PLANAR_ANCHOR_POSITION,
    size: WATER_OPTICS_PLANAR_ANCHOR_SIZE,
    color: WATER_OPTICS_PLANAR_ANCHOR_COLOR
  })
]);

export const WATER_OPTICS_LAB_ROIS: readonly WaterOpticsLabRoi[] = Object.freeze([
  Object.freeze({ id: "shallow-bed", normalizedRect: [0.15, 0.48, 0.2, 0.24] as const }),
  Object.freeze({ id: "medium-bed", normalizedRect: [0.4, 0.48, 0.2, 0.24] as const }),
  Object.freeze({ id: "deep-bed", normalizedRect: [0.65, 0.48, 0.2, 0.24] as const }),
  Object.freeze({ id: "foreground-rail", normalizedRect: [0.23, 0.785, 0.54, 0.03] as const }),
  Object.freeze({ id: "column-red-above", normalizedRect: [0.235, 0.25, 0.02, 0.1] as const }),
  Object.freeze({ id: "column-green-above", normalizedRect: [0.492, 0.25, 0.02, 0.1] as const }),
  Object.freeze({ id: "column-blue-above", normalizedRect: [0.742, 0.25, 0.02, 0.1] as const }),
  Object.freeze({ id: "planar-clip", normalizedRect: [0.78, 0.56, 0.18, 0.09] as const })
]);

export function getWaterOpticsBaseQuality(tier: WaterOpticsTier): WaterQualityTier {
  return tier === "medium" ? WaterQualityTier.Medium : WaterQualityTier.High;
}

export function createWaterOpticsLabFixture(tier: WaterOpticsTier): WaterOpticsLabFixture {
  const wetTexelCount = WATER_OPTICS_LAB_WIDTH * WATER_OPTICS_LAB_LENGTH;
  const wetTexelIndices = new Uint32Array(wetTexelCount);
  const surfaceHeights = new Float32Array(wetTexelCount);
  const bedHeights = new Float32Array(wetTexelCount);
  const flowVectorsXZ = new Float32Array(wetTexelCount * 2);

  for (let row = 0; row < WATER_OPTICS_LAB_LENGTH; row++) {
    for (let column = 0; column < WATER_OPTICS_LAB_WIDTH; column++) {
      const index = row * WATER_OPTICS_LAB_WIDTH + column;
      const depthBand = Math.min(2, Math.floor((column * 3) / WATER_OPTICS_LAB_WIDTH));
      wetTexelIndices[index] = index;
      surfaceHeights[index] = WATER_OPTICS_LAB_SURFACE_Y;
      bedHeights[index] = WATER_OPTICS_LAB_SURFACE_Y - WATER_OPTICS_LAB_DEPTHS[depthBand];
      flowVectorsXZ[index * 2] = 0.08;
      flowVectorsXZ[index * 2 + 1] = -0.015;
    }
  }

  return Object.freeze({
    tier,
    descriptor: {
      schemaVersion: HeightfieldWaterSchemaVersion.V1,
      id: WATER_OPTICS_LAB_ID,
      grid: {
        originXZ: [-(WATER_OPTICS_LAB_WIDTH - 1) * 0.5, -(WATER_OPTICS_LAB_LENGTH - 1) * 0.5] as const,
        cellSizeXZ: [1, 1] as const,
        width: WATER_OPTICS_LAB_WIDTH,
        height: WATER_OPTICS_LAB_LENGTH
      },
      wetTexelIndices,
      surfaceHeights,
      bedHeights,
      flowVectorsXZ,
      waveAsset: {
        schemaVersion: WaterWaveSchemaVersion.V1,
        model: WaterWaveModel.DirectionalGerstner,
        generator: {
          waveCount: 8,
          seed: 0x0f71c5,
          randomness: 0.42,
          minWavelength: 0.75,
          maxWavelength: 5.5,
          wavelengthFalloff: 1.14,
          minAmplitude: 0.004,
          maxAmplitude: 0.055,
          amplitudeFalloff: 1.3,
          dominantWindAngle: -0.35,
          dominantAngularSpread: 0.3,
          smallWaveSteepness: 0.1,
          largeWaveSteepness: 0.24,
          steepnessFalloff: 1.06
        }
      },
      quality: getWaterOpticsBaseQuality(tier),
      material: {
        shallowColor: [0.025, 0.31, 0.36, 0.62] as const,
        deepColor: [0.005, 0.035, 0.075, 0.9] as const,
        opacity: 0.74,
        shoreFoamWidth: 0.28,
        microNormalStrength: 0.72,
        waveStrength: 0.3
      }
    },
    targets: WATER_OPTICS_LAB_TARGETS,
    rois: WATER_OPTICS_LAB_ROIS
  });
}
