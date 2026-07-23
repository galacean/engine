/** Caller-owned contracts for testing whether a world position lies inside a water medium. */
import type { Vector3 } from "@galacean/engine-math";

export interface WaterVolumeSample {
  waterBodyId: string;
  insideFootprint: boolean;
  insideVolume: boolean;
  surfaceHeight: number;
  bottomHeight: number;
  signedSurfaceDistance: number;
  submergedDepth: number;
  waterDepth: number;
}

/**
 * Evaluates a body's vertical water column at one world-space position.
 *
 * A true return value means the horizontal footprint was resolved and every
 * field in `outSample` is valid. `insideVolume` remains false above the water
 * surface and below the finite bottom so callers can implement hysteresis.
 */
export interface WaterVolumeProvider {
  sampleVolume(worldPosition: Vector3, outSample: WaterVolumeSample): boolean;
}

export function createWaterVolumeSample(): WaterVolumeSample {
  return {
    waterBodyId: "",
    insideFootprint: false,
    insideVolume: false,
    surfaceHeight: 0,
    bottomHeight: 0,
    signedSurfaceDistance: 0,
    submergedDepth: 0,
    waterDepth: 0
  };
}

export function resetWaterVolumeSample(sample: WaterVolumeSample): void {
  sample.waterBodyId = "";
  sample.insideFootprint = false;
  sample.insideVolume = false;
  sample.surfaceHeight = 0;
  sample.bottomHeight = 0;
  sample.signedSurfaceDistance = 0;
  sample.submergedDepth = 0;
  sample.waterDepth = 0;
}
