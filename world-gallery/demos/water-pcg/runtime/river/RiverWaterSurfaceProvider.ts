import type { Vector3 } from "@galacean/engine-math";
import type { WaterSurfaceProvider, WaterSurfaceSample } from "../query/WaterSurfaceProvider";
import { resetWaterSurfaceSample } from "../query/WaterSurfaceProvider";
import { createRiverNetworkQueryResult } from "./RiverQueryService";
import type { RiverRuntimeController } from "./RiverRuntimeController";

type ActiveRiverSurfaceSource = Pick<RiverRuntimeController, "sampleActiveSurface">;

/** Adapts the currently active River runtime to the internal water-surface contract. */
export class RiverWaterSurfaceProvider implements WaterSurfaceProvider {
  private readonly _queryResult = createRiverNetworkQueryResult();

  constructor(private readonly _riverRuntime: ActiveRiverSurfaceSource) {}

  sampleSurface(worldPosition: Vector3, outSample: WaterSurfaceSample): boolean {
    resetWaterSurfaceSample(outSample);
    const result = this._queryResult;
    if (!this._riverRuntime.sampleActiveSurface(worldPosition, result) || !result.insideFootprint) {
      return false;
    }

    outSample.waterBodyId = result.waterBodyId;
    outSample.surfacePosition.set(worldPosition.x, result.surfaceHeight, worldPosition.z);
    outSample.surfaceNormal.copyFrom(result.surfaceNormal);
    outSample.waterVelocity.set(result.flowVector.x, result.surfaceVerticalVelocity, result.flowVector.z);
    outSample.waterDepth = result.waterDepth;
    return true;
  }
}
