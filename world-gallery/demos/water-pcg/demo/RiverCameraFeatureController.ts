/**
 * Demo-owned camera feature policy for River material quality.
 *
 * Camera depth and opaque-color generation are scene-wide costs, so materials
 * must not enable them implicitly. The demo owns the request and restores the
 * camera's original state when River is hidden, Low is selected, or destroyed.
 */
import { DepthTextureMode, Downsampling } from "@galacean/engine-core";
import { RiverQualityLevel } from "../authoring/river/RiverAuthoringEnums";

export interface RiverCameraFeatureTarget {
  depthTextureMode: DepthTextureMode;
  opaqueTextureEnabled: boolean;
  opaqueTextureDownsampling: Downsampling;
}

export class RiverCameraFeatureController {
  private readonly _originalDepthTextureMode: DepthTextureMode;
  private readonly _originalOpaqueTextureEnabled: boolean;
  private readonly _originalOpaqueTextureDownsampling: Downsampling;
  private _depthTextureRequested = false;
  private _opaqueTextureRequested = false;

  constructor(private readonly _camera: RiverCameraFeatureTarget) {
    this._originalDepthTextureMode = _camera.depthTextureMode;
    this._originalOpaqueTextureEnabled = _camera.opaqueTextureEnabled;
    this._originalOpaqueTextureDownsampling = _camera.opaqueTextureDownsampling;
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
    this._camera.depthTextureMode = this._depthTextureRequested
      ? DepthTextureMode.PrePass
      : this._originalDepthTextureMode;
    this._camera.opaqueTextureEnabled = this._opaqueTextureRequested || this._originalOpaqueTextureEnabled;
    this._camera.opaqueTextureDownsampling = this._opaqueTextureRequested
      ? Downsampling.None
      : this._originalOpaqueTextureDownsampling;
  }

  destroy(): void {
    this._depthTextureRequested = false;
    this._opaqueTextureRequested = false;
    this._camera.depthTextureMode = this._originalDepthTextureMode;
    this._camera.opaqueTextureEnabled = this._originalOpaqueTextureEnabled;
    this._camera.opaqueTextureDownsampling = this._originalOpaqueTextureDownsampling;
  }
}
