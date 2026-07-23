/** Finite volume adapter over an existing final-surface provider and its authored depth. */
import type { Vector3 } from "@galacean/engine-math";
import { createWaterSurfaceSample, type WaterSurfaceProvider } from "../query/WaterSurfaceProvider";
import { resetWaterVolumeSample, type WaterVolumeProvider, type WaterVolumeSample } from "./WaterVolumeProvider";

const DEFAULT_VERTICAL_EPSILON = 1e-6;

export interface SurfaceDepthWaterVolumeProviderOptions {
  readonly verticalEpsilon?: number;
}

/**
 * Treats `surfaceHeight - waterDepth` as a finite bottom. The wrapped surface
 * provider remains the single source of dynamic height and depth truth.
 */
export class SurfaceDepthWaterVolumeProvider implements WaterVolumeProvider {
  private readonly _surfaceSample = createWaterSurfaceSample();
  private readonly _verticalEpsilon: number;

  constructor(
    private readonly _surface: WaterSurfaceProvider,
    options: SurfaceDepthWaterVolumeProviderOptions = {}
  ) {
    this._verticalEpsilon = Math.max(0, options.verticalEpsilon ?? DEFAULT_VERTICAL_EPSILON);
  }

  sampleVolume(worldPosition: Vector3, outSample: WaterVolumeSample): boolean {
    resetWaterVolumeSample(outSample);
    const surface = this._surfaceSample;
    if (!this._surface.sampleSurface(worldPosition, surface)) return false;

    const waterDepth = surface.waterDepth;
    if (!Number.isFinite(waterDepth) || waterDepth < 0) return false;
    const surfaceHeight = surface.surfacePosition.y;
    if (!Number.isFinite(surfaceHeight)) return false;

    const bottomHeight = surfaceHeight - waterDepth;
    const signedSurfaceDistance = worldPosition.y - surfaceHeight;
    const epsilon = this._verticalEpsilon;
    outSample.waterBodyId = surface.waterBodyId;
    outSample.insideFootprint = true;
    outSample.insideVolume = signedSurfaceDistance <= epsilon && worldPosition.y >= bottomHeight - epsilon;
    outSample.surfaceHeight = surfaceHeight;
    outSample.bottomHeight = bottomHeight;
    outSample.signedSurfaceDistance = signedSurfaceDistance;
    outSample.submergedDepth = Math.min(waterDepth, Math.max(0, -signedSurfaceDistance));
    outSample.waterDepth = waterDepth;
    return true;
  }
}
