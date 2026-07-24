/** Deterministic bathymetry/current/obstacle facts for the canonical beach-at-dusk Ocean. */
import type { OceanNearshoreDescriptorV1 } from "../../authoring/ocean/OceanNearshoreDescriptor";
import {
  OceanNearshoreOutsidePolicy,
  OceanNearshoreSchemaVersion
} from "../../authoring/ocean/OceanNearshoreTypes";

const GRID_WIDTH = 256;
const GRID_HEIGHT = 128;
const CELL_SIZE = 1.25;
const GRID_MINIMUM_X = -160;
const GRID_MINIMUM_Z = -120;
const WATER_LEVEL = 0;

export function evaluateOceanBeachShorelineZ(worldX: number): number {
  return (
    4.5 +
    worldX * worldX * 0.0022 +
    Math.sin(worldX * 0.045) * 2.4 +
    Math.sin(worldX * 0.013 + 0.8) * 1.2
  );
}

export function evaluateOceanBeachBedHeight(
  worldX: number,
  worldZ: number
): number {
  const shoreDistance = evaluateOceanBeachShorelineZ(worldX) - worldZ;
  if (shoreDistance > 0) {
    const shelfDepth = Math.min(
      15,
      0.035 +
        shoreDistance * 0.105 +
        Math.max(0, shoreDistance - 45) * 0.035
    );
    const sandbar =
      Math.exp(-Math.pow((shoreDistance - 18) / 8, 2)) *
      (0.3 + Math.sin(worldX * 0.09) * 0.08);
    const ripple =
      Math.sin(worldX * 0.11 + worldZ * 0.035) *
      Math.exp(-Math.max(shoreDistance, 0) / 65) *
      0.045;
    return WATER_LEVEL - Math.max(0.025, shelfDepth - sandbar + ripple);
  }
  const landDistance = -shoreDistance;
  const dune =
    Math.max(0, landDistance - 10) * 0.045 +
    Math.sin(worldX * 0.05) * Math.min(0.18, landDistance * 0.012);
  return WATER_LEVEL + 0.035 + landDistance * 0.075 + dune;
}

export function createOceanBeachNearshoreDescriptor(): OceanNearshoreDescriptorV1 {
  const bedHeights = new Float32Array(GRID_WIDTH * GRID_HEIGHT);
  const baseCurrentsXZ = new Float32Array(GRID_WIDTH * GRID_HEIGHT * 2);
  const originX = GRID_MINIMUM_X + CELL_SIZE * 0.5;
  const originZ = GRID_MINIMUM_Z + CELL_SIZE * 0.5;
  for (let z = 0; z < GRID_HEIGHT; z++) {
    const worldZ = originZ + z * CELL_SIZE;
    for (let x = 0; x < GRID_WIDTH; x++) {
      const worldX = originX + x * CELL_SIZE;
      const index = z * GRID_WIDTH + x;
      bedHeights[index] = evaluateOceanBeachBedHeight(worldX, worldZ);
      const depth = Math.max(0, WATER_LEVEL - bedHeights[index]);
      const currentScale = Math.min(1, depth / 5);
      baseCurrentsXZ[index * 2] =
        (0.08 + Math.sin(worldZ * 0.025) * 0.035) * currentScale;
      baseCurrentsXZ[index * 2 + 1] =
        Math.sin(worldX * 0.03 + worldZ * 0.008) * 0.025 * currentScale;
    }
  }
  return {
    schemaVersion: OceanNearshoreSchemaVersion.V1,
    id: "ocean-beach-dusk-nearshore-v1",
    waterLevel: WATER_LEVEL,
    grid: {
      originXZ: [originX, originZ],
      cellSizeXZ: [CELL_SIZE, CELL_SIZE],
      width: GRID_WIDTH,
      height: GRID_HEIGHT
    },
    bedHeights,
    baseCurrentsXZ,
    wetSource: { kind: "water-level", minimumDepth: 0.02 },
    outsidePolicy: {
      negativeX: OceanNearshoreOutsidePolicy.DeepOcean,
      positiveX: OceanNearshoreOutsidePolicy.DeepOcean,
      negativeZ: OceanNearshoreOutsidePolicy.DeepOcean,
      positiveZ: OceanNearshoreOutsidePolicy.Dry
    },
    obstacles: [
      {
        id: "hero-rock-west",
        shape: "ellipse",
        centerXZ: [-25, -13],
        radiiXZ: [3.35, 2.45],
        rotationRadians: -0.42,
        height: 4.2
      },
      {
        id: "hero-rock-east",
        shape: "ellipse",
        centerXZ: [16, -17],
        radiiXZ: [3.05, 2.35],
        rotationRadians: 0.89,
        height: 4.8
      },
      {
        id: "shore-rock-detail",
        shape: "ellipse",
        centerXZ: [29, -4],
        radiiXZ: [2.15, 1.65],
        rotationRadians: -1.08,
        height: 3.2
      }
    ]
  };
}

export const OCEAN_BEACH_SHOWCASE_WATER_LEVEL = WATER_LEVEL;
