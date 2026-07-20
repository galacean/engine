import { Vector3 } from "@galacean/engine-math";

/** Caller-owned world-space sample populated by a {@link WaterSurfaceProvider}. */
export interface WaterSurfaceSample {
  waterBodyId: string;
  surfacePosition: Vector3;
  surfaceNormal: Vector3;
  waterVelocity: Vector3;
  waterDepth: number;
}

/** Internal contract for querying a water body's current visible macro surface. */
export interface WaterSurfaceProvider {
  /**
   * Returns true only when the query's horizontal projection is inside the
   * provider's actual water footprint and all fields in `outSample` are valid.
   */
  sampleSurface(worldPosition: Vector3, outSample: WaterSurfaceSample): boolean;
}

/** Creates storage for repeated allocation-free water-surface queries. */
export function createWaterSurfaceSample(): WaterSurfaceSample {
  return {
    waterBodyId: "",
    surfacePosition: new Vector3(),
    surfaceNormal: new Vector3(0, 1, 0),
    waterVelocity: new Vector3(),
    waterDepth: 0
  };
}

/** Restores a caller-owned sample without replacing its vector instances. */
export function resetWaterSurfaceSample(sample: WaterSurfaceSample): void {
  sample.waterBodyId = "";
  sample.surfacePosition.set(0, 0, 0);
  sample.surfaceNormal.set(0, 1, 0);
  sample.waterVelocity.set(0, 0, 0);
  sample.waterDepth = 0;
}
