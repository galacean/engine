/** Single owner for scene-wide camera textures requested by visible water bodies. */
import {
  DepthTextureMode,
  Downsampling,
  ScreenSpaceReflectionQuality,
  ScreenSpaceReflectionReceiverMode,
  type ScreenSpaceReflection,
  type ScreenSpaceReflectionConsumerLease,
  type ScreenSpaceReflectionConsumerRequest,
  type ScreenSpaceReflectionResolvedSettings
} from "@galacean/engine-core";
import type { WaterSurfaceFieldGraphReadback } from "../surface/WaterSurfaceFieldResolver";
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
  /** Optional V2 diagnostic graph; the broker reads it but never owns field providers. */
  readonly fieldGraph?: WaterSurfaceFieldGraphReadback;
}

export interface WaterCameraSurfaceFieldGraphReadback {
  readonly cameraConsumerId: string;
  readonly graph: WaterSurfaceFieldGraphReadback;
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
  > & {
    readonly metrics: Pick<
      ScreenSpaceReflection["metrics"],
      "activeConsumerLeaseCount" | "resolvedSettings" | "transparentResolvedSettings"
    >;
  };
}

type MutableScreenSpaceReflectionConsumerRequest = {
  -readonly [Property in keyof ScreenSpaceReflectionConsumerRequest]: ScreenSpaceReflectionConsumerRequest[Property];
};

export interface CameraWaterFeatureMetrics {
  readonly activeConsumerCount: number;
  /** Stable, sorted ids of all requests contributing to Camera features. */
  readonly activeConsumerIds: readonly string[];
  readonly surfaceFieldGraphs: readonly WaterCameraSurfaceFieldGraphReadback[];
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
  /** Actual depth publication path observed on the most recently rendered Camera frame. */
  readonly depthTextureSource: "none" | "prepass" | "forward-resolve";
  readonly depthPrepassPassCount: 0 | 1;
  readonly forwardDepthResolvePassCount: 0 | 1;
  readonly screenSpaceReflectionRequested: boolean;
  /** The broker owns either zero or one engine consumer lease, independent of Water consumer count. */
  readonly screenSpaceReflectionLeaseCount: 0 | 1;
  readonly screenSpaceReflectionEffective: boolean;
  readonly screenSpaceReflectionSupported: boolean;
  readonly screenSpaceReflectionUnsupportedReason: string | null;
  /** Consumer whose complete SSR request won Water-local whole-request arbitration. */
  readonly selectedScreenSpaceReflectionConsumerId?: string;
  /** Exact selected Water request, absent when no visible Water consumer requests SSR. */
  readonly screenSpaceReflectionConsumerRequest?: Readonly<ScreenSpaceReflectionConsumerRequest>;
  /** Trace settings Core resolves for the transparent Water receiver phase. */
  readonly screenSpaceReflectionResolvedSettings?: Readonly<ScreenSpaceReflectionResolvedSettings>;
  /** Includes consumers outside Water and is useful for sole/shared ownership acceptance tests. */
  readonly totalScreenSpaceReflectionConsumerLeaseCount: number;
  readonly opaqueTextureDownsampling: Downsampling;
  /** Water-attributed incremental estimate; retained alias for existing callers. */
  readonly estimatedRenderTargetBytes: number;
  readonly incrementalEstimatedRenderTargetBytes: number;
  readonly totalEstimatedRenderTargetBytes: number;
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
  private _selectedScreenSpaceReflectionConsumerId?: string;
  private _selectedScreenSpaceReflectionRequest?: Readonly<ScreenSpaceReflectionConsumerRequest>;
  private _screenSpaceReflectionAcquireFailure: string | null = null;
  private _viewportWidth = 0;
  private _viewportHeight = 0;
  private _nextLeaseId = 1;
  private _metrics: CameraWaterFeatureMetrics;
  private _destroyed = false;

  constructor(private readonly _camera: WaterCameraFeatureTarget) {
    this._originalDepthTextureMode = _camera.depthTextureMode;
    this._originalOpaqueTextureEnabled = _camera.opaqueTextureEnabled;
    this._originalOpaqueTextureDownsampling = _camera.opaqueTextureDownsampling;
    this._originalForwardDepthResolveEnabled = _camera._enableForwardDepthResolve;
    this._metrics = this._createMetrics(false, false, false, [], [], this._originalOpaqueTextureDownsampling);
  }

  get metrics(): CameraWaterFeatureMetrics {
    const screenSpaceReflection = this._camera.screenSpaceReflection;
    const depthTextureSource = this._resolveDepthTextureSource();
    return Object.freeze({
      ...this._metrics,
      depthTextureSource,
      depthPrepassPassCount: depthTextureSource === "prepass" ? 1 : 0,
      forwardDepthResolvePassCount: depthTextureSource === "forward-resolve" ? 1 : 0,
      screenSpaceReflectionLeaseCount: this._screenSpaceReflectionLease?.active === true ? 1 : 0,
      screenSpaceReflectionEffective: screenSpaceReflection?.effective === true,
      screenSpaceReflectionSupported: screenSpaceReflection?.supported === true,
      screenSpaceReflectionUnsupportedReason:
        this._screenSpaceReflectionAcquireFailure ??
        (screenSpaceReflection
          ? screenSpaceReflection.unsupportedReason
          : "camera-screen-space-reflection-unavailable"),
      selectedScreenSpaceReflectionConsumerId: this._selectedScreenSpaceReflectionConsumerId,
      screenSpaceReflectionConsumerRequest: this._selectedScreenSpaceReflectionRequest,
      screenSpaceReflectionResolvedSettings: screenSpaceReflection?.metrics.transparentResolvedSettings,
      totalScreenSpaceReflectionConsumerLeaseCount: screenSpaceReflection?.metrics.activeConsumerLeaseCount ?? 0
    });
  }

  setViewportSize(width: number, height: number): void {
    this._viewportWidth = Math.max(0, Math.floor(width));
    this._viewportHeight = Math.max(0, Math.floor(height));
    this._apply();
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
    this._selectedScreenSpaceReflectionConsumerId = undefined;
    this._selectedScreenSpaceReflectionRequest = undefined;
    this._releaseScreenSpaceReflectionOwnership();
    this._restoreOriginalState();
    this._metrics = this._createMetrics(false, false, false, [], [], this._originalOpaqueTextureDownsampling);
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
    this._selectedScreenSpaceReflectionConsumerId = selectedScreenSpaceReflection?.consumerId;
    this._selectedScreenSpaceReflectionRequest = frozenScreenSpaceReflectionRequest;
    this._applyScreenSpaceReflectionOwnership(frozenScreenSpaceReflectionRequest);
    this._metrics = this._createMetrics(
      depthRequested,
      opaqueRequested,
      frozenScreenSpaceReflectionRequest !== undefined,
      requests.map(({ consumerId }) => consumerId).sort(),
      requests
        .flatMap(({ consumerId, request }) =>
          request.fieldGraph ? [Object.freeze({ cameraConsumerId: consumerId, graph: request.fieldGraph })] : []
        )
        .sort((left, right) =>
          left.cameraConsumerId === right.cameraConsumerId
            ? left.graph.sourceId.localeCompare(right.graph.sourceId)
            : left.cameraConsumerId.localeCompare(right.cameraConsumerId)
        ),
      opaqueRequested ? selectedDownsampling : this._originalOpaqueTextureDownsampling
    );
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

  private _createMetrics(
    depthRequested: boolean,
    opaqueRequested: boolean,
    screenSpaceReflectionRequested: boolean,
    activeConsumerIds: readonly string[],
    surfaceFieldGraphs: readonly WaterCameraSurfaceFieldGraphReadback[],
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
    const depthTextureSource = this._resolveDepthTextureSource();
    return Object.freeze({
      activeConsumerCount: activeConsumerIds.length,
      activeConsumerIds: Object.freeze([...activeConsumerIds]),
      surfaceFieldGraphs: Object.freeze([...surfaceFieldGraphs]),
      depthTextureRequested: depthRequested,
      opaqueTextureRequested: opaqueRequested,
      depthCopyPassCount: depthRequested ? 1 : 0,
      colorCopyPassCount: opaqueRequested ? 1 : 0,
      incrementalDepthCopyPassCount: depthRequested ? 1 : 0,
      incrementalColorCopyPassCount: opaqueRequested ? 1 : 0,
      totalDepthCopyPassCount: totalDepthEnabled ? 1 : 0,
      totalColorCopyPassCount: totalColorEnabled ? 1 : 0,
      depthTextureSource,
      depthPrepassPassCount: depthTextureSource === "prepass" ? 1 : 0,
      forwardDepthResolvePassCount: depthTextureSource === "forward-resolve" ? 1 : 0,
      screenSpaceReflectionRequested,
      screenSpaceReflectionLeaseCount: this._screenSpaceReflectionLease?.active === true ? 1 : 0,
      screenSpaceReflectionEffective: this._camera.screenSpaceReflection?.effective === true,
      screenSpaceReflectionSupported: this._camera.screenSpaceReflection?.supported === true,
      screenSpaceReflectionUnsupportedReason:
        this._screenSpaceReflectionAcquireFailure ??
        (this._camera.screenSpaceReflection
          ? this._camera.screenSpaceReflection.unsupportedReason
          : "camera-screen-space-reflection-unavailable"),
      screenSpaceReflectionConsumerRequest: this._screenSpaceReflectionRequest,
      screenSpaceReflectionResolvedSettings: this._camera.screenSpaceReflection?.metrics.transparentResolvedSettings,
      totalScreenSpaceReflectionConsumerLeaseCount:
        this._camera.screenSpaceReflection?.metrics.activeConsumerLeaseCount ?? 0,
      opaqueTextureDownsampling: downsampling,
      estimatedRenderTargetBytes: incrementalEstimatedRenderTargetBytes,
      incrementalEstimatedRenderTargetBytes,
      totalEstimatedRenderTargetBytes
    });
  }

  private _resolveDepthTextureSource(): "none" | "prepass" | "forward-resolve" {
    return (
      this._camera.depthTextureSource ?? (this._camera.depthTextureMode === DepthTextureMode.None ? "none" : "prepass")
    );
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
      this._screenSpaceReflectionAcquireFailure = "camera-screen-space-reflection-unavailable";
      return;
    }
    try {
      if (this._screenSpaceReflectionLease?.active) {
        if (this._screenSpaceReflectionLease.update(request)) {
          this._screenSpaceReflectionRequest = request;
          this._screenSpaceReflectionAcquireFailure = null;
          return;
        }
      }
      const lease = target.acquireConsumer("water-pcg", request);
      if (!lease.active) {
        lease.release();
        this._screenSpaceReflectionAcquireFailure = "camera-screen-space-reflection-lease-inactive";
        return;
      }
      const previousLease = this._screenSpaceReflectionLease;
      this._screenSpaceReflectionLease = lease;
      this._screenSpaceReflectionRequest = request;
      this._screenSpaceReflectionAcquireFailure = null;
      previousLease?.release();
    } catch {
      this._screenSpaceReflectionAcquireFailure = this._screenSpaceReflectionLease?.active
        ? "camera-screen-space-reflection-update-failed"
        : "camera-screen-space-reflection-acquire-failed";
    }
  }

  private _releaseScreenSpaceReflectionOwnership(): void {
    this._screenSpaceReflectionLease?.release();
    this._screenSpaceReflectionLease = undefined;
    this._screenSpaceReflectionRequest = undefined;
    this._screenSpaceReflectionAcquireFailure = null;
  }
}
