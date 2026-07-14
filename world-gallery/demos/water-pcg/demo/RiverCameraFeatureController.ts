/**
 * Demo-owned camera feature policy for River material quality.
 *
 * Camera depth generation is a scene-wide cost, so materials must not enable it
 * implicitly. The demo owns the request and restores the camera's original mode
 * when River is hidden, Low quality is selected, or the controller is destroyed.
 */
import { DepthTextureMode } from "@galacean/engine-core";
import { RiverQualityLevel } from "../authoring/river/RiverAuthoringEnums";

export interface RiverCameraFeatureTarget {
  depthTextureMode: DepthTextureMode;
}

export class RiverCameraFeatureController {
  private readonly _originalDepthTextureMode: DepthTextureMode;
  private _depthTextureRequested = false;

  constructor(private readonly _camera: RiverCameraFeatureTarget) {
    this._originalDepthTextureMode = _camera.depthTextureMode;
  }

  get depthTextureRequested(): boolean {
    return this._depthTextureRequested;
  }

  apply(riverVisible: boolean, materialQuality: RiverQualityLevel): void {
    this._depthTextureRequested = riverVisible && materialQuality !== RiverQualityLevel.Low;
    this._camera.depthTextureMode = this._depthTextureRequested
      ? DepthTextureMode.PrePass
      : this._originalDepthTextureMode;
  }

  destroy(): void {
    this._depthTextureRequested = false;
    this._camera.depthTextureMode = this._originalDepthTextureMode;
  }
}
