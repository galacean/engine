import { Vector3 } from "@galacean/engine-math";
import type { CompiledWaterPlanarTransformV1 } from "../body/WaterPlanarTransform";
import type { WaterSurfaceProvider, WaterSurfaceSample } from "../query/WaterSurfaceProvider";
import { resetWaterSurfaceSample } from "../query/WaterSurfaceProvider";
import { createRiverNetworkQueryResult } from "./RiverQueryService";
import type { RiverRuntimeController } from "./RiverRuntimeController";

type ActiveRiverSurfaceSource = Pick<RiverRuntimeController, "sampleActiveSurface">;

/** Adapts the currently active River runtime to the internal water-surface contract. */
export class RiverWaterSurfaceProvider implements WaterSurfaceProvider {
  private readonly _queryResult = createRiverNetworkQueryResult();

  constructor(
    private readonly _riverRuntime: ActiveRiverSurfaceSource,
    private readonly _waterBodyId?: string
  ) {}

  sampleSurface(worldPosition: Vector3, outSample: WaterSurfaceSample): boolean {
    resetWaterSurfaceSample(outSample);
    const result = this._queryResult;
    if (!this._riverRuntime.sampleActiveSurface(worldPosition, result) || !result.insideFootprint) {
      return false;
    }

    outSample.waterBodyId = this._waterBodyId ?? result.waterBodyId;
    outSample.surfacePosition.set(worldPosition.x, result.surfaceHeight, worldPosition.z);
    outSample.surfaceNormal.copyFrom(result.surfaceNormal);
    outSample.waterVelocity.set(result.flowVector.x, result.surfaceVerticalVelocity, result.flowVector.z);
    outSample.waterDepth = result.waterDepth;
    return true;
  }
}

/**
 * World-facing River query seam over one body-local runtime.
 *
 * `logicalBodyOrigin` belongs to the host/floating-origin placement, while the
 * planar transform belongs to the WaterBody instance. Keeping both outside
 * the compiled query preserves source/cache identity and avoids applying the
 * host translation to the renderer twice.
 */
export class TransformedRiverWaterSurfaceProvider extends RiverWaterSurfaceProvider {
  private readonly _localPosition = new Vector3();

  constructor(
    riverRuntime: ActiveRiverSurfaceSource,
    waterBodyId: string,
    private readonly _logicalBodyOrigin: readonly [x: number, z: number],
    private readonly _planarTransform: Readonly<CompiledWaterPlanarTransformV1>
  ) {
    super(riverRuntime, waterBodyId);
  }

  override sampleSurface(worldPosition: Vector3, outSample: WaterSurfaceSample): boolean {
    const transform = this._planarTransform;
    const position = transform.source.position;
    const relativeX = worldPosition.x - this._logicalBodyOrigin[0] - position[0];
    const relativeZ = worldPosition.z - this._logicalBodyOrigin[1] - position[2];
    this._localPosition.set(
      relativeX * transform.cosine - relativeZ * transform.sine,
      worldPosition.y - position[1],
      relativeX * transform.sine + relativeZ * transform.cosine
    );
    if (!super.sampleSurface(this._localPosition, outSample)) return false;

    const localSurfaceX = outSample.surfacePosition.x;
    const localSurfaceZ = outSample.surfacePosition.z;
    outSample.surfacePosition.set(
      this._logicalBodyOrigin[0] + position[0] + localSurfaceX * transform.cosine + localSurfaceZ * transform.sine,
      position[1] + outSample.surfacePosition.y,
      this._logicalBodyOrigin[1] + position[2] - localSurfaceX * transform.sine + localSurfaceZ * transform.cosine
    );
    const localNormalX = outSample.surfaceNormal.x;
    const localNormalZ = outSample.surfaceNormal.z;
    outSample.surfaceNormal.set(
      localNormalX * transform.cosine + localNormalZ * transform.sine,
      outSample.surfaceNormal.y,
      -localNormalX * transform.sine + localNormalZ * transform.cosine
    );
    const localVelocityX = outSample.waterVelocity.x;
    const localVelocityZ = outSample.waterVelocity.z;
    outSample.waterVelocity.set(
      localVelocityX * transform.cosine + localVelocityZ * transform.sine,
      outSample.waterVelocity.y,
      -localVelocityX * transform.sine + localVelocityZ * transform.cosine
    );
    return true;
  }
}
