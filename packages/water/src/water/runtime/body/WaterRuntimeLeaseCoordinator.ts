/** Shared acquisition/release ordering for Water runtime and Camera feature leases. */
import type { WaterResourceAssetDescriptorV1 } from "../../authoring/body/WaterBodyAuthoringTypes";
import type {
  CameraWaterFeatureBroker,
  WaterCameraFeatureRequest,
  WaterCameraFeatureRequestLease
} from "../optics/CameraWaterFeatureBroker";
import type {
  WaterRuntimeResourceLease,
  WaterRuntimeResourceRegistry
} from "../resources/WaterRuntimeResourceRegistry";

export interface WaterRuntimeLeaseAcquireOptions {
  readonly signal?: AbortSignal;
  readonly runtimeContext?: unknown;
}

export class WaterRuntimeLeaseCoordinator {
  readonly cameraFeatures: readonly CameraWaterFeatureBroker[];

  constructor(
    cameraFeatures: readonly CameraWaterFeatureBroker[],
    private readonly _runtimeResources?: WaterRuntimeResourceRegistry
  ) {
    this.cameraFeatures = Object.freeze([...new Set(cameraFeatures)]);
  }

  async acquireRuntimeResourcesInto(
    target: WaterRuntimeResourceLease[],
    descriptors: readonly WaterResourceAssetDescriptorV1[],
    options: Readonly<WaterRuntimeLeaseAcquireOptions>
  ): Promise<void> {
    if (descriptors.length > 0 && !this._runtimeResources) {
      throw new Error("Water runtime resource registry is unavailable.");
    }
    for (const descriptor of descriptors) {
      const lease = await this._runtimeResources!.acquire(descriptor, options);
      if (lease) target.push(lease);
    }
  }

  async releaseRuntimeResources(leases: WaterRuntimeResourceLease[]): Promise<void> {
    let firstError: unknown;
    for (let index = leases.length - 1; index >= 0; index--) {
      try {
        await leases[index].destroy();
      } catch (error) {
        firstError ??= error;
      }
    }
    leases.length = 0;
    if (firstError) throw firstError;
  }

  acquireCameraFeatures(bodyId: string, request: WaterCameraFeatureRequest): WaterCameraFeatureRequestLease[] {
    if (this.cameraFeatures.length === 0) {
      // SSR alone may fall back through non-Camera presentation sources.
      if (!request.depthTexture && !request.opaqueTexture) return [];
      throw new Error(`Water body '${bodyId}' requires camera features but no broker was provided.`);
    }
    const leases: WaterCameraFeatureRequestLease[] = [];
    try {
      for (let cameraIndex = 0; cameraIndex < this.cameraFeatures.length; cameraIndex++) {
        const consumerId =
          cameraIndex === 0 ? `water-body:${bodyId}` : `water-body:${bodyId}:camera-${cameraIndex + 1}`;
        leases.push(this.cameraFeatures[cameraIndex].acquireRequest(consumerId, request));
      }
      return leases;
    } catch (error) {
      this.releaseCameraFeatures(leases);
      throw error;
    }
  }

  releaseCameraFeatures(leases: WaterCameraFeatureRequestLease[]): void {
    const errors: unknown[] = [];
    for (let index = leases.length - 1; index >= 0; index--) {
      try {
        leases[index].destroy();
      } catch (error) {
        errors.push(error);
      }
    }
    leases.length = 0;
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, "Water Camera lease cleanup failed.");
  }
}
