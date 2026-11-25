/** Single owner for scene-wide camera textures requested by visible water bodies. */
import { DepthTextureMode, Downsampling } from "@galacean/engine-core";
import {
  acquireCameraDepthTexturePrePass,
  type CameraDepthTexturePrePassLease
} from "@galacean/engine-modify/rendering/CameraDepthTexturePrePass";

export type WaterCameraFeatureQuality = "low" | "medium" | "high";

export interface WaterCameraFeatureRequest {
  readonly depthTexture: boolean;
  readonly opaqueTexture: boolean;
  readonly reflection: "none" | "probe" | "ssr";
  readonly caustics: boolean;
  readonly quality: WaterCameraFeatureQuality;
  readonly opaqueDownsampling?: Downsampling;
}

export interface WaterCameraFeatureTarget {
  depthTextureMode: DepthTextureMode;
  opaqueTextureEnabled: boolean;
  opaqueTextureDownsampling: Downsampling;
  /** Internal Core opt-in; Water enables it only when it owns the added depth requirement. */
  _enableForwardDepthResolve?: boolean;
  /** Optional for legacy test doubles; production Camera reports its most recent render path. */
  readonly depthTextureSource?: "none" | "prepass" | "forward-resolve";
}

export interface WaterCameraFeatureRequestLease {
  readonly consumerId: string;
  readonly active: boolean;
  destroy(): void;
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
  // Default Scene Color refraction to half resolution ("2x") for high/medium to bound TBDR bandwidth;
  // callers requiring full-resolution opaque color pass request.opaqueDownsampling = Downsampling.None explicitly.
  return quality === "low" ? Downsampling.FourX : Downsampling.TwoX;
}

export class CameraWaterFeatureBroker {
  private readonly _requests = new Map<string, WaterCameraFeatureRequest>();
  private readonly _leaseRequests = new Map<
    number,
    { readonly consumerId: string; readonly request: WaterCameraFeatureRequest }
  >();
  private readonly _originalDepthTextureMode: DepthTextureMode;
  private readonly _originalOpaqueTextureEnabled: boolean;
  private readonly _originalOpaqueTextureDownsampling: Downsampling;
  private readonly _originalForwardDepthResolveEnabled: boolean | undefined;
  private _depthTextureLease?: CameraDepthTexturePrePassLease;
  private _ssrRequested = false;
  private _nextLeaseId = 1;
  private _destroyed = false;

  constructor(private readonly _camera: WaterCameraFeatureTarget) {
    this._originalDepthTextureMode = _camera.depthTextureMode;
    this._originalOpaqueTextureEnabled = _camera.opaqueTextureEnabled;
    this._originalOpaqueTextureDownsampling = _camera.opaqueTextureDownsampling;
    this._originalForwardDepthResolveEnabled = _camera._enableForwardDepthResolve;
  }

  /** Whether any visible active Water body on this camera requests SSR. */
  get ssrRequested(): boolean {
    return this._ssrRequested;
  }

  setRequest(consumerId: string, request?: WaterCameraFeatureRequest): void {
    if (this._destroyed) throw new Error("Camera water feature broker has been destroyed.");
    if (request) this._requests.set(consumerId, request);
    else this._requests.delete(consumerId);
    this._apply();
  }

  acquireRequest(consumerId: string, request: WaterCameraFeatureRequest): WaterCameraFeatureRequestLease {
    if (this._destroyed) throw new Error("Camera water feature broker has been destroyed.");
    const leaseId = this._nextLeaseId++;
    this._leaseRequests.set(leaseId, { consumerId, request });
    this._apply();
    let active = true;
    return Object.freeze({
      consumerId,
      get active() {
        return active;
      },
      destroy: () => {
        if (!active) return;
        active = false;
        if (this._leaseRequests.delete(leaseId)) this._apply();
      }
    });
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
    this._leaseRequests.clear();
    this._ssrRequested = false;
    this._restoreOriginalState();
  }

  private _apply(): void {
    let depthRequested = false;
    let ssrRequested = false;
    let opaqueRequested = this._originalOpaqueTextureEnabled;
    let selectedDownsampling = this._originalOpaqueTextureDownsampling;
    for (const request of this._requests.values()) {
      if (request.reflection === "ssr") ssrRequested = true;
      depthRequested ||= request.depthTexture;
      if (!request.opaqueTexture) continue;
      const downsampling = request.opaqueDownsampling ?? qualityDownsampling(request.quality);
      if (!opaqueRequested || downsamplingRank(downsampling) < downsamplingRank(selectedDownsampling)) {
        selectedDownsampling = downsampling;
      }
      opaqueRequested = true;
    }
    for (const entry of this._leaseRequests.values()) {
      const request = entry.request;
      if (request.reflection === "ssr") ssrRequested = true;
      depthRequested ||= request.depthTexture;
      if (!request.opaqueTexture) continue;
      const downsampling = request.opaqueDownsampling ?? qualityDownsampling(request.quality);
      if (!opaqueRequested || downsamplingRank(downsampling) < downsamplingRank(selectedDownsampling)) {
        selectedDownsampling = downsampling;
      }
      opaqueRequested = true;
    }
    this._ssrRequested = ssrRequested;
    this._setDepthTextureRequired(depthRequested);
    if (this._originalForwardDepthResolveEnabled !== undefined) {
      this._camera._enableForwardDepthResolve =
        this._originalForwardDepthResolveEnabled ||
        ((depthRequested || this._camera.depthTextureMode !== DepthTextureMode.None) &&
          this._originalDepthTextureMode === DepthTextureMode.None);
    }
    this._camera.opaqueTextureEnabled = opaqueRequested;
    this._camera.opaqueTextureDownsampling = selectedDownsampling;
  }

  private _restoreOriginalState(): void {
    this._setDepthTextureRequired(false);
    this._camera.opaqueTextureEnabled = this._originalOpaqueTextureEnabled;
    this._camera.opaqueTextureDownsampling = this._originalOpaqueTextureDownsampling;
    if (this._originalForwardDepthResolveEnabled !== undefined) {
      this._camera._enableForwardDepthResolve = this._originalForwardDepthResolveEnabled;
    }
  }

  private _setDepthTextureRequired(required: boolean): void {
    if (required) {
      this._depthTextureLease ??= acquireCameraDepthTexturePrePass(
        this._camera,
        DepthTextureMode.PrePass,
        "water-camera-features"
      );
    } else {
      this._depthTextureLease?.destroy();
      this._depthTextureLease = undefined;
    }
  }
}
