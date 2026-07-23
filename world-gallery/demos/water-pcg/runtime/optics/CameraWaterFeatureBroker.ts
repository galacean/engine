/** Single owner for scene-wide camera textures requested by visible water bodies. */
import { DepthTextureMode, Downsampling } from "@galacean/engine-core";

export type WaterCameraFeatureQuality = "low" | "medium" | "high";

export interface WaterCameraFeatureRequest {
  readonly depthTexture: boolean;
  readonly opaqueTexture: boolean;
  readonly reflection: "none" | "probe" | "planar" | "ssr";
  readonly caustics: boolean;
  readonly underwater: boolean;
  readonly quality: WaterCameraFeatureQuality;
  readonly opaqueDownsampling?: Downsampling;
}

export interface WaterCameraFeatureTarget {
  depthTextureMode: DepthTextureMode;
  opaqueTextureEnabled: boolean;
  opaqueTextureDownsampling: Downsampling;
  /** Optional for legacy surface-only test doubles; required by underwater requests. */
  enablePostProcess?: boolean;
}

export interface CameraWaterFeatureMetrics {
  readonly activeConsumerCount: number;
  /** Stable, sorted ids of the requests that produced this merged Camera state. */
  readonly activeConsumerIds: readonly string[];
  readonly depthTextureRequested: boolean;
  readonly opaqueTextureRequested: boolean;
  /** Water-requested incremental copy counts; retained aliases for existing callers. */
  readonly depthCopyPassCount: 0 | 1;
  readonly colorCopyPassCount: 0 | 1;
  readonly incrementalDepthCopyPassCount: 0 | 1;
  readonly incrementalColorCopyPassCount: 0 | 1;
  /** Actual camera totals after merging the original camera state with water requests. */
  readonly totalDepthCopyPassCount: 0 | 1;
  readonly totalColorCopyPassCount: 0 | 1;
  readonly underwaterRequested: boolean;
  readonly postProcessEnabled: boolean;
  readonly opaqueTextureDownsampling: Downsampling;
  /** Water-attributed incremental estimate; retained alias for existing callers. */
  readonly estimatedRenderTargetBytes: number;
  readonly incrementalEstimatedRenderTargetBytes: number;
  readonly totalEstimatedRenderTargetBytes: number;
}

function downsamplingRank(value: Downsampling): number {
  switch (value) {
    case Downsampling.None:
      return 0;
    case Downsampling.TwoX:
      return 1;
    case Downsampling.FourX:
      return 2;
    default:
      return 3;
  }
}

function qualityDownsampling(quality: WaterCameraFeatureQuality): Downsampling {
  return quality === "high" ? Downsampling.None : quality === "medium" ? Downsampling.TwoX : Downsampling.FourX;
}

export class CameraWaterFeatureBroker {
  private readonly _requests = new Map<string, WaterCameraFeatureRequest>();
  private readonly _originalDepthTextureMode: DepthTextureMode;
  private readonly _originalOpaqueTextureEnabled: boolean;
  private readonly _originalOpaqueTextureDownsampling: Downsampling;
  private readonly _originalEnablePostProcess?: boolean;
  private _viewportWidth = 0;
  private _viewportHeight = 0;
  private _metrics: CameraWaterFeatureMetrics;
  private _destroyed = false;

  constructor(private readonly _camera: WaterCameraFeatureTarget) {
    this._originalDepthTextureMode = _camera.depthTextureMode;
    this._originalOpaqueTextureEnabled = _camera.opaqueTextureEnabled;
    this._originalOpaqueTextureDownsampling = _camera.opaqueTextureDownsampling;
    this._originalEnablePostProcess = _camera.enablePostProcess;
    this._metrics = this._createMetrics(false, false, false, [], this._originalOpaqueTextureDownsampling);
  }

  get metrics(): CameraWaterFeatureMetrics {
    return this._metrics;
  }

  setViewportSize(width: number, height: number): void {
    this._viewportWidth = Math.max(0, Math.floor(width));
    this._viewportHeight = Math.max(0, Math.floor(height));
    this._apply();
  }

  setRequest(consumerId: string, request?: WaterCameraFeatureRequest): void {
    if (this._destroyed) throw new Error("Camera water feature broker has been destroyed.");
    if (request?.underwater && this._originalEnablePostProcess === undefined) {
      throw new Error("Underwater camera requests require an enablePostProcess target.");
    }
    if (request) this._requests.set(consumerId, request);
    else this._requests.delete(consumerId);
    this._apply();
  }

  removeRequest(consumerId: string): boolean {
    const removed = this._requests.delete(consumerId);
    if (removed) this._apply();
    return removed;
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._requests.clear();
    this._restoreOriginalState();
    this._metrics = this._createMetrics(false, false, false, [], this._originalOpaqueTextureDownsampling);
  }

  private _apply(): void {
    let depthRequested = false;
    let opaqueRequested = false;
    let underwaterRequested = false;
    let selectedDownsampling = Downsampling.FourX;
    let hasOpaqueResolution = false;
    for (const request of this._requests.values()) {
      underwaterRequested ||= request.underwater;
      depthRequested ||= request.depthTexture || request.underwater;
      opaqueRequested ||= request.opaqueTexture;
      if (!request.opaqueTexture) continue;
      const downsampling = request.opaqueDownsampling ?? qualityDownsampling(request.quality);
      if (!hasOpaqueResolution || downsamplingRank(downsampling) < downsamplingRank(selectedDownsampling)) {
        selectedDownsampling = downsampling;
        hasOpaqueResolution = true;
      }
    }
    this._camera.depthTextureMode = depthRequested ? DepthTextureMode.PrePass : this._originalDepthTextureMode;
    this._camera.opaqueTextureEnabled = opaqueRequested || this._originalOpaqueTextureEnabled;
    this._camera.opaqueTextureDownsampling = opaqueRequested
      ? selectedDownsampling
      : this._originalOpaqueTextureDownsampling;
    if (this._originalEnablePostProcess !== undefined) {
      this._camera.enablePostProcess = underwaterRequested || this._originalEnablePostProcess;
    }
    this._metrics = this._createMetrics(
      depthRequested,
      opaqueRequested,
      underwaterRequested,
      [...this._requests.keys()].sort(),
      opaqueRequested ? selectedDownsampling : this._originalOpaqueTextureDownsampling
    );
  }

  private _createMetrics(
    depthRequested: boolean,
    opaqueRequested: boolean,
    underwaterRequested: boolean,
    activeConsumerIds: readonly string[],
    downsampling: Downsampling
  ): CameraWaterFeatureMetrics {
    const divisor = downsampling === Downsampling.None ? 1 : downsampling === Downsampling.TwoX ? 2 : 4;
    const pixelCount = Math.ceil(this._viewportWidth / divisor) * Math.ceil(this._viewportHeight / divisor);
    const depthBytes = depthRequested ? this._viewportWidth * this._viewportHeight * 4 : 0;
    const colorBytes = opaqueRequested ? pixelCount * 4 : 0;
    const totalDepthEnabled = this._camera.depthTextureMode !== DepthTextureMode.None;
    const totalColorEnabled = this._camera.opaqueTextureEnabled;
    const totalDownsampling = this._camera.opaqueTextureDownsampling;
    const totalDivisor = totalDownsampling === Downsampling.None ? 1 : totalDownsampling === Downsampling.TwoX ? 2 : 4;
    const totalColorPixelCount =
      Math.ceil(this._viewportWidth / totalDivisor) * Math.ceil(this._viewportHeight / totalDivisor);
    const incrementalEstimatedRenderTargetBytes = depthBytes + colorBytes;
    const totalEstimatedRenderTargetBytes =
      (totalDepthEnabled ? this._viewportWidth * this._viewportHeight * 4 : 0) +
      (totalColorEnabled ? totalColorPixelCount * 4 : 0);
    return Object.freeze({
      activeConsumerCount: activeConsumerIds.length,
      activeConsumerIds: Object.freeze([...activeConsumerIds]),
      depthTextureRequested: depthRequested,
      opaqueTextureRequested: opaqueRequested,
      depthCopyPassCount: depthRequested ? 1 : 0,
      colorCopyPassCount: opaqueRequested ? 1 : 0,
      incrementalDepthCopyPassCount: depthRequested ? 1 : 0,
      incrementalColorCopyPassCount: opaqueRequested ? 1 : 0,
      totalDepthCopyPassCount: totalDepthEnabled ? 1 : 0,
      totalColorCopyPassCount: totalColorEnabled ? 1 : 0,
      underwaterRequested,
      postProcessEnabled: underwaterRequested || this._originalEnablePostProcess === true,
      opaqueTextureDownsampling: downsampling,
      estimatedRenderTargetBytes: incrementalEstimatedRenderTargetBytes,
      incrementalEstimatedRenderTargetBytes,
      totalEstimatedRenderTargetBytes
    });
  }

  private _restoreOriginalState(): void {
    this._camera.depthTextureMode = this._originalDepthTextureMode;
    this._camera.opaqueTextureEnabled = this._originalOpaqueTextureEnabled;
    this._camera.opaqueTextureDownsampling = this._originalOpaqueTextureDownsampling;
    if (this._originalEnablePostProcess !== undefined) {
      this._camera.enablePostProcess = this._originalEnablePostProcess;
    }
  }
}
