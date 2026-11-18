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
