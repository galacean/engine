/** Single owner for scene-wide camera textures requested by visible water bodies. */
import {
  DepthTextureMode,
  Downsampling,
  ScreenSpaceReflectionQuality,
  ScreenSpaceReflectionReceiverMode,
  type ScreenSpaceReflection,
  type ScreenSpaceReflectionConsumerLease,
  type ScreenSpaceReflectionConsumerRequest
} from "@galacean/engine-core";
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
  /**
   * Optional scene-scale SSR tuning. The broker deterministically selects one
   * complete normalized Water request and forwards it unchanged to the Camera.
   */
  readonly screenSpaceReflection?: Readonly<ScreenSpaceReflectionConsumerRequest>;
}

export interface WaterCameraFeatureTarget {
  depthTextureMode: DepthTextureMode;
  opaqueTextureEnabled: boolean;
  opaqueTextureDownsampling: Downsampling;
  /** Internal Core opt-in; Water enables it only when it owns the added depth requirement. */
  _enableForwardDepthResolve?: boolean;
  /** Optional for legacy test doubles; production Camera reports its most recent render path. */
  readonly depthTextureSource?: "none" | "prepass" | "forward-resolve";
  /** Optional for legacy test doubles. Production Camera instances own this feature. */
  readonly screenSpaceReflection?: Pick<
    ScreenSpaceReflection,
    "effective" | "supported" | "unsupportedReason" | "acquireConsumer"
  > & {};
}

type MutableScreenSpaceReflectionConsumerRequest = {
  -readonly [Property in keyof ScreenSpaceReflectionConsumerRequest]: ScreenSpaceReflectionConsumerRequest[Property];
};

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
  return quality === "high" ? Downsampling.None : quality === "medium" ? Downsampling.TwoX : Downsampling.FourX;
}

const WATER_SCREEN_SPACE_REFLECTION_REQUESTS: Readonly<
  Record<WaterCameraFeatureQuality, Readonly<ScreenSpaceReflectionConsumerRequest>>
> = Object.freeze({
  low: Object.freeze({
    receiverMode: ScreenSpaceReflectionReceiverMode.TransparentSampleOnly,
    quality: ScreenSpaceReflectionQuality.Low,
    resolutionScale: 0.5,
    maxRayDistance: 32,
    thickness: 0.35,
    maxRoughness: 0.7,
    edgeFade: 0.1
  }),
  medium: Object.freeze({
    receiverMode: ScreenSpaceReflectionReceiverMode.TransparentSampleOnly,
    quality: ScreenSpaceReflectionQuality.Medium,
    resolutionScale: 0.5,
    maxRayDistance: 56,
    thickness: 0.5,
    maxRoughness: 0.7,
    edgeFade: 0.08
  }),
  high: Object.freeze({
    receiverMode: ScreenSpaceReflectionReceiverMode.TransparentSampleOnly,
    quality: ScreenSpaceReflectionQuality.High,
    resolutionScale: 0.5,
    maxRayDistance: 80,
    thickness: 0.6,
    maxRoughness: 0.7,
    edgeFade: 0.06
  })
});

function screenSpaceReflectionQualityRank(quality: ScreenSpaceReflectionQuality | undefined): number {
  switch (quality) {
    case ScreenSpaceReflectionQuality.Low:
      return 0;
    case ScreenSpaceReflectionQuality.Medium:
      return 1;
    case ScreenSpaceReflectionQuality.High:
      return 2;
    default:
      return -1;
  }
}

function freezeScreenSpaceReflectionRequest(
  request: Readonly<ScreenSpaceReflectionConsumerRequest>
): Readonly<ScreenSpaceReflectionConsumerRequest> {
  return Object.freeze({ ...request });
}

function screenSpaceReflectionRequestsEqual(
  left: Readonly<ScreenSpaceReflectionConsumerRequest> | undefined,
  right: Readonly<ScreenSpaceReflectionConsumerRequest>
): boolean {
  if (!left) return false;
  return (
    left.priority === right.priority &&
    left.receiverMode === right.receiverMode &&
    left.quality === right.quality &&
    left.resolutionScale === right.resolutionScale &&
    left.intensity === right.intensity &&
    left.maxRayDistance === right.maxRayDistance &&
    left.thickness === right.thickness &&
    left.maxRoughness === right.maxRoughness &&
    left.edgeFade === right.edgeFade
  );
}

function resolveScreenSpaceReflectionCandidate(
  quality: WaterCameraFeatureQuality,
  override?: Readonly<ScreenSpaceReflectionConsumerRequest>
): MutableScreenSpaceReflectionConsumerRequest {
  const candidate: MutableScreenSpaceReflectionConsumerRequest = {
    ...WATER_SCREEN_SPACE_REFLECTION_REQUESTS[quality]
  };
  if (!override) return candidate;
  if (override.priority !== undefined) {
    candidate.priority = Number.isFinite(override.priority) ? override.priority : 0;
  }
  if (override.quality !== undefined) candidate.quality = override.quality;
  if (override.resolutionScale !== undefined) candidate.resolutionScale = override.resolutionScale;
  if (override.intensity !== undefined) candidate.intensity = override.intensity;
  if (override.maxRayDistance !== undefined) candidate.maxRayDistance = override.maxRayDistance;
  if (override.thickness !== undefined) candidate.thickness = override.thickness;
  if (override.maxRoughness !== undefined) candidate.maxRoughness = override.maxRoughness;
  if (override.edgeFade !== undefined) candidate.edgeFade = override.edgeFade;
  return candidate;
}

interface WaterScreenSpaceReflectionCandidate {
  readonly consumerId: string;
  readonly request: Readonly<ScreenSpaceReflectionConsumerRequest>;
}

function screenSpaceReflectionRequestKey(request: Readonly<ScreenSpaceReflectionConsumerRequest>): string {
  return JSON.stringify([
    request.priority ?? 0,
    request.receiverMode ?? null,
    request.quality ?? null,
    request.resolutionScale ?? null,
    request.intensity ?? null,
    request.maxRayDistance ?? null,
    request.thickness ?? null,
    request.maxRoughness ?? null,
    request.edgeFade ?? null
  ]);
}

/** Exact Core arbitration: priority desc, then UTF-16 code-unit label/key asc. */
function compareScreenSpaceReflectionCandidates(
  left: WaterScreenSpaceReflectionCandidate,
  right: WaterScreenSpaceReflectionCandidate
): number {
  const priorityDifference = (right.request.priority ?? 0) - (left.request.priority ?? 0);
  if (priorityDifference !== 0) return priorityDifference;
  if (left.consumerId !== right.consumerId) return left.consumerId < right.consumerId ? -1 : 1;
  const leftKey = screenSpaceReflectionRequestKey(left.request);
  const rightKey = screenSpaceReflectionRequestKey(right.request);
  return leftKey === rightKey ? 0 : leftKey < rightKey ? -1 : 1;
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
  private _screenSpaceReflectionLease?: ScreenSpaceReflectionConsumerLease;
  private _screenSpaceReflectionRequest?: Readonly<ScreenSpaceReflectionConsumerRequest>;
  private _nextLeaseId = 1;
  private _destroyed = false;

  constructor(private readonly _camera: WaterCameraFeatureTarget) {
    this._originalDepthTextureMode = _camera.depthTextureMode;
    this._originalOpaqueTextureEnabled = _camera.opaqueTextureEnabled;
    this._originalOpaqueTextureDownsampling = _camera.opaqueTextureDownsampling;
    this._originalForwardDepthResolveEnabled = _camera._enableForwardDepthResolve;
  }

  setRequest(consumerId: string, request?: WaterCameraFeatureRequest): void {
    if (this._destroyed) throw new Error("Camera water feature broker has been destroyed.");
    if (request) this._validateRequest(request);
    if (request) this._requests.set(consumerId, request);
    else this._requests.delete(consumerId);
    this._apply();
  }

  acquireRequest(consumerId: string, request: WaterCameraFeatureRequest): WaterCameraFeatureRequestLease {
    if (this._destroyed) throw new Error("Camera water feature broker has been destroyed.");
    this._validateRequest(request);
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
    this._releaseScreenSpaceReflectionOwnership();
    this._restoreOriginalState();
  }

  private _apply(): void {
    let depthRequested = false;
    let opaqueRequested = false;
    let selectedDownsampling = Downsampling.FourX;
    let hasOpaqueResolution = false;
    const requests = [
      ...[...this._requests].map(([consumerId, request]) => ({ consumerId, request })),
      ...this._leaseRequests.values()
    ];
    const screenSpaceReflectionCandidates: WaterScreenSpaceReflectionCandidate[] = [];
    for (const { consumerId, request } of requests) {
      if (request.reflection === "ssr") {
        screenSpaceReflectionCandidates.push({
          consumerId,
          request: freezeScreenSpaceReflectionRequest(
            resolveScreenSpaceReflectionCandidate(request.quality, request.screenSpaceReflection)
          )
        });
      }
      depthRequested ||= request.depthTexture;
      opaqueRequested ||= request.opaqueTexture;
      if (!request.opaqueTexture) continue;
      const downsampling = request.opaqueDownsampling ?? qualityDownsampling(request.quality);
      if (!hasOpaqueResolution || downsamplingRank(downsampling) < downsamplingRank(selectedDownsampling)) {
        selectedDownsampling = downsampling;
        hasOpaqueResolution = true;
      }
    }
    this._setDepthTextureRequired(depthRequested);
    if (this._originalForwardDepthResolveEnabled !== undefined) {
      this._camera._enableForwardDepthResolve =
        this._originalForwardDepthResolveEnabled ||
        (depthRequested && this._originalDepthTextureMode === DepthTextureMode.None);
    }
    this._camera.opaqueTextureEnabled = opaqueRequested || this._originalOpaqueTextureEnabled;
    this._camera.opaqueTextureDownsampling = opaqueRequested
      ? selectedDownsampling
      : this._originalOpaqueTextureDownsampling;
    screenSpaceReflectionCandidates.sort(compareScreenSpaceReflectionCandidates);
    const selectedScreenSpaceReflection = screenSpaceReflectionCandidates[0];
    const frozenScreenSpaceReflectionRequest = selectedScreenSpaceReflection?.request;
    this._applyScreenSpaceReflectionOwnership(frozenScreenSpaceReflectionRequest);
  }

  private _validateRequest(request: WaterCameraFeatureRequest): void {
    if (request.screenSpaceReflection && request.reflection !== "ssr") {
      throw new Error("Water Camera SSR settings require reflection='ssr'.");
    }
    const screenSpaceReflection = request.screenSpaceReflection;
    if (!screenSpaceReflection) return;
    if (
      screenSpaceReflection.receiverMode !== undefined &&
      screenSpaceReflection.receiverMode !== ScreenSpaceReflectionReceiverMode.TransparentSampleOnly
    ) {
      throw new RangeError("Water Camera SSR requests may only target the transparent sample-only receiver phase.");
    }
    if (
      screenSpaceReflection.quality !== undefined &&
      screenSpaceReflectionQualityRank(screenSpaceReflection.quality) < 0
    ) {
      throw new RangeError("Water Camera SSR quality is invalid.");
    }
    const finiteRanges = [
      ["resolutionScale", screenSpaceReflection.resolutionScale, 0.25, 1],
      ["intensity", screenSpaceReflection.intensity, 0, 1],
      ["maxRayDistance", screenSpaceReflection.maxRayDistance, Number.EPSILON, Number.POSITIVE_INFINITY],
      ["thickness", screenSpaceReflection.thickness, Number.EPSILON, Number.POSITIVE_INFINITY],
      ["maxRoughness", screenSpaceReflection.maxRoughness, 0, 1],
      ["edgeFade", screenSpaceReflection.edgeFade, 0, 0.5]
    ] as const;
    for (const [name, value, minimum, maximum] of finiteRanges) {
      if (value !== undefined && (!Number.isFinite(value) || value < minimum || value > maximum)) {
        throw new RangeError(`Water Camera SSR ${name} is outside its supported range.`);
      }
    }
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

  private _applyScreenSpaceReflectionOwnership(
    request: Readonly<ScreenSpaceReflectionConsumerRequest> | undefined
  ): void {
    if (!request) {
      this._releaseScreenSpaceReflectionOwnership();
      return;
    }
    if (
      this._screenSpaceReflectionLease?.active &&
      screenSpaceReflectionRequestsEqual(this._screenSpaceReflectionRequest, request)
    ) {
      return;
    }
    const target = this._camera.screenSpaceReflection;
    if (!target) {
      return;
    }
    try {
      if (this._screenSpaceReflectionLease?.active) {
        if (this._screenSpaceReflectionLease.update(request)) {
          this._screenSpaceReflectionRequest = request;
          return;
        }
      }
      const lease = target.acquireConsumer("water-pcg", request);
      if (!lease.active) {
        lease.release();
        return;
      }
      const previousLease = this._screenSpaceReflectionLease;
      this._screenSpaceReflectionLease = lease;
      this._screenSpaceReflectionRequest = request;
      previousLease?.release();
    } catch {
      // A camera may reject SSR ownership; environment reflection remains available.
    }
  }

  private _releaseScreenSpaceReflectionOwnership(): void {
    this._screenSpaceReflectionLease?.release();
    this._screenSpaceReflectionLease = undefined;
    this._screenSpaceReflectionRequest = undefined;
  }
}
