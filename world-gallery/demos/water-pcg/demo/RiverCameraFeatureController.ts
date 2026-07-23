/**
 * Demo-owned camera feature policy for River material quality.
 *
 * Camera depth and opaque-color generation are scene-wide costs, so materials
 * must not enable them implicitly. The demo owns the request and restores the
 * camera's original state when River is hidden, Low is selected, or destroyed.
 */
import { Downsampling } from "@galacean/engine-core";
import { RiverQualityLevel } from "../authoring/river/RiverAuthoringEnums";
import { CameraWaterFeatureBroker, type WaterCameraFeatureTarget } from "../runtime/optics/CameraWaterFeatureBroker";

export type RiverCameraFeatureTarget = WaterCameraFeatureTarget;

let nextRiverCameraConsumerId = 0;

export class RiverCameraFeatureController {
  private readonly _broker: CameraWaterFeatureBroker;
  private readonly _ownsBroker: boolean;
  private readonly _consumerId: string;
  private _depthTextureRequested = false;
  private _opaqueTextureRequested = false;

  constructor(camera: RiverCameraFeatureTarget, broker?: CameraWaterFeatureBroker) {
    this._broker = broker ?? new CameraWaterFeatureBroker(camera);
    this._ownsBroker = broker === undefined;
    this._consumerId = `river-camera-${nextRiverCameraConsumerId++}`;
  }

  get depthTextureRequested(): boolean {
    return this._depthTextureRequested;
  }

  get opaqueTextureRequested(): boolean {
    return this._opaqueTextureRequested;
  }

  apply(riverVisible: boolean, materialQuality: RiverQualityLevel): void {
    this._depthTextureRequested = riverVisible && materialQuality !== RiverQualityLevel.Low;
    this._opaqueTextureRequested = this._depthTextureRequested;
    this._broker.setRequest(
      this._consumerId,
      this._depthTextureRequested
        ? {
            depthTexture: true,
            opaqueTexture: true,
            reflection: "none",
            caustics: false,
            underwater: false,
            quality: materialQuality === RiverQualityLevel.High ? "high" : "medium",
            opaqueDownsampling: materialQuality === RiverQualityLevel.High ? Downsampling.None : Downsampling.TwoX
          }
        : undefined
    );
  }

  destroy(): void {
    this._depthTextureRequested = false;
    this._opaqueTextureRequested = false;
    this._broker.removeRequest(this._consumerId);
    if (this._ownsBroker) this._broker.destroy();
  }
}
