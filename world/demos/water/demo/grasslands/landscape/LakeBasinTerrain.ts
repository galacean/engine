import type { LakeBoundaryV1, HeightfieldWaterGridConfig } from "@galacean/engine-water/water/index";

import {
  decodeLakeBoundary,
  sampleLakeBoundary,
  sampleLakeSignedShoreDistance,
  hashStableValue,
  captureLakeTerrain,
  compileLakeTerrainModifier,
  applyLakeTerrainPatches
} from "@galacean/engine-water/water/compiler/index";
import type { LakeTerrainSnapshot } from "@galacean/engine-water/water/compiler/index";

import { captureWaterTerrainSnapshot, type WaterTerrainSnapshot } from "@galacean/engine-water/water/index";

export type LakeTerrainPreset = "hills" | "flat" | "existing-basin";

export interface LakeBasinSettings {
  /** Fixed authoring datum: changing the current water level never moves this ground. */
  readonly referenceLevel: number;
  readonly depth: number;
  readonly shoreWidth: number;
  readonly falloffWidth?: number;
  readonly profile?: "natural" | "calibration";
}

const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

/** Demo-owned inputs, independent of the lake's editable outline and water level. */
export function createLakeDemoBaseTerrain(
  grid: HeightfieldWaterGridConfig,
  preset: LakeTerrainPreset
): WaterTerrainSnapshot {
  if (grid.cellSizeXZ[0] !== grid.cellSizeXZ[1]) throw new Error("Lake mock terrain requires square source cells.");
  if (!["flat", "hills", "existing-basin"].includes(preset)) throw new Error("Unknown Lake terrain preset.");
  return captureWaterTerrainSnapshot(
    {
      id: `lake-demo-${preset}`,
      revision: 0,
      origin: grid.originXZ,
      spacing: grid.cellSizeXZ[0],
      columns: grid.width,
      rows: grid.height
    },
    (x, z) => {
      if (preset === "flat") return 1.3;
      const rollingHeight = 1.3 + 0.55 * (1 + Math.sin(x * 0.08) * Math.cos(z * 0.09));
      if (preset === "hills") {
        // Broad far-bank hills make the base terrain visible from the hero camera while keeping the foreground low.
        const westHill = 8 * Math.exp(-(((x + 22) / 14) ** 2 + ((z + 25) / 10) ** 2));
        const eastHill = 5.5 * Math.exp(-(((x - 18) / 13) ** 2 + ((z + 28) / 8) ** 2));
        return rollingHeight + westHill + eastHill;
      }
      const distance = (1 - Math.hypot(x / 28, z / 18)) * 18;
      return distance > 0 ? -3.2 * smooth(distance / 8) : rollingHeight * smooth(-distance / 4);
    }
  );
}

export function deriveLakeDemoTerrain(
  base: WaterTerrainSnapshot,
  boundary: LakeBoundaryV1,
  settings: LakeBasinSettings,
  revision: number
): WaterTerrainSnapshot {
  const patch = compileLakeTerrainModifier(base, boundary, {
    schemaVersion: 1,
    id: "lake-demo-basin",
    lakeId: "lake-demo",
    mode: "carve-only",
    referenceLevel: settings.referenceLevel,
    depth: settings.depth,
    shoreWidth: settings.shoreWidth,
    falloffWidth: settings.falloffWidth ?? 4,
    profile: "natural"
  });
  return applyLakeTerrainPatches(base, [patch], revision);
}

/** Demo terrain authoring, inspired by UE WaterBrush distance/elevation curves. No Water runtime terrain writes. */
export function createLakeBasinTerrain(
  boundary: LakeBoundaryV1,
  grid: HeightfieldWaterGridConfig,
  settings: LakeBasinSettings
): LakeTerrainSnapshot {
  if (settings.profile !== "calibration") {
    const terrain = captureLakeTerrain(
      deriveLakeDemoTerrain(createLakeDemoBaseTerrain(grid, "hills"), boundary, settings, 0)
    );
    return Object.freeze({ ...terrain, hash: hashStableValue(terrain) });
  }
  if (
    !Number.isFinite(settings.referenceLevel) ||
    !(settings.depth > 0) ||
    !(settings.shoreWidth > 0) ||
    !Number.isFinite(settings.depth + settings.shoreWidth)
  )
    throw new Error("Invalid Lake basin depth or shore width.");
  const sampled = sampleLakeBoundary(decodeLakeBoundary(boundary));
  const heights = new Float32Array(grid.width * grid.height);
  for (let i = 0; i < heights.length; i++) {
    const x = grid.originXZ[0] + (i % grid.width) * grid.cellSizeXZ[0];
    const z = grid.originXZ[1] + Math.floor(i / grid.width) * grid.cellSizeXZ[1];
    const distance = sampleLakeSignedShoreDistance(sampled.rings, x, z);
    const targetDepth = settings.profile === "calibration" ? (z > 6 ? 0.25 : z < -6 ? 2 : 1) : settings.depth;
    const t = Math.max(0, Math.min(1, distance / (settings.profile === "calibration" ? 2 : settings.shoreWidth)));
    // A nonzero, matched slope at the waterline avoids grid-shaped zero-height plateaus.
    const bedWeight = t + t * t - t * t * t;
    const shoreSlope = targetDepth / (settings.profile === "calibration" ? 2 : settings.shoreWidth);
    heights[i] =
      settings.referenceLevel +
      (distance >= 0
        ? -targetDepth * bedWeight
        : 1.3 * (1 - Math.exp((distance * shoreSlope) / 1.3)) +
          (0.6 + 0.45 * Math.sin(x * 0.14) * Math.cos(z * 0.17)) * smooth((-distance - 2) / 7));
  }
  return Object.freeze({ grid, heights, hash: hashStableValue({ grid, heights }) });
}
