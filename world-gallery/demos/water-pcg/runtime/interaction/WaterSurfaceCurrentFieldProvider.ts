import { Vector3 } from "@galacean/engine-math";
import { createWaterSurfaceSample, type WaterSurfaceProvider } from "../query/WaterSurfaceProvider";
import {
  WaterLocalModifierChannel,
  resetWaterLocalFieldSample,
  type WaterLocalFieldProvider,
  type WaterLocalFieldSample
} from "./WaterLocalFieldProvider";

/**
 * Adapts an authoritative final-surface velocity into the shared local-current contract.
 *
 * This is a sparse point-query adapter. Dense visual simulations must consume a
 * data-only `WaterCurrentFieldSnapshot` instead of invoking the full surface path per texel.
 */
export class WaterSurfaceCurrentFieldProvider implements WaterLocalFieldProvider {
  readonly channels = WaterLocalModifierChannel.CurrentLarge;

  private readonly _queryPosition = new Vector3();
  private readonly _surfaceSample = createWaterSurfaceSample();

  constructor(private readonly _surface: WaterSurfaceProvider) {}

  sampleLocalField(worldX: number, worldZ: number, outSample: WaterLocalFieldSample): boolean {
    resetWaterLocalFieldSample(outSample);
    if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) return false;
    this._queryPosition.set(worldX, 0, worldZ);
    if (!this._surface.sampleSurface(this._queryPosition, this._surfaceSample)) return false;
    outSample.currentLargeX = this._surfaceSample.waterVelocity.x;
    outSample.currentLargeZ = this._surfaceSample.waterVelocity.z;
    return true;
  }
}
