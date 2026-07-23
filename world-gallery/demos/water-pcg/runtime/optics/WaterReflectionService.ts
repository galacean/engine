/** Per-camera reflection owner with a single bounded planar render target. */
import {
  Camera,
  Engine,
  Entity,
  Layer,
  RenderTarget,
  Texture2D,
  TextureCube,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode
} from "@galacean/engine-core";
import { MathUtil, Matrix, Plane, Vector3 } from "@galacean/engine-math";
import {
  isNormalizedWorldPlane,
  signedDistanceToNormalizedPlane,
  tryCreateNormalizedWorldPlane,
  tryCreateObliquePerspectiveProjection,
  tryReflectPointAcrossPlane,
  tryReflectVectorAcrossPlane,
  tryTransformPlaneToViewSpace
} from "./PlanarReflectionMath";
import {
  WATER_REFLECTION_QUALITY_POLICY,
  WaterReflectionOwnerArbitrator,
  isWaterReflectionRequestPlanarEligible,
  type WaterReflectionArbitrationState,
  type WaterReflectionAvailability,
  type WaterReflectionFallbackReason,
  type WaterReflectionPendingReason,
  type WaterReflectionRequest,
  type WaterReflectionResolution,
  type WaterReflectionSource
} from "./WaterReflectionPolicy";
import type { WaterGpuTimer } from "./WaterGpuTimer";

const DEFAULT_MIN_PLANAR_RESOLUTION = 64;
const DEFAULT_MAX_PLANAR_RESOLUTION = 1024;
const PLANAR_BYTES_PER_PIXEL_ESTIMATE = 8;
const CPU_TIMING_CAPACITY = 120;
const DEFAULT_PLANAR_CLIP_BIAS = 0.02;
const DEFAULT_MINIMUM_CAMERA_PLANE_DISTANCE = 0.05;
const PLANAR_BACK_FACE_EPSILON = 1e-4;
const PROJECTION_STATE_VALUE_COUNT = 18;
const RENDER_TARGET_FLIP_Y = new Matrix(1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);

export interface WaterReflectionBinding {
  readonly requestedSource: WaterReflectionSource;
  readonly resolvedSource: WaterReflectionSource;
  readonly fallbackReason?: WaterReflectionResolution["fallbackReason"];
  readonly probeTexture?: TextureCube;
  readonly planarTexture?: Texture2D;
  readonly planarViewProjection?: Readonly<Matrix>;
}

interface MutableWaterReflectionBinding {
  requestedSource: WaterReflectionSource;
  resolvedSource: WaterReflectionSource;
  fallbackReason?: WaterReflectionResolution["fallbackReason"];
  probeTexture?: TextureCube;
  planarTexture?: Texture2D;
  planarViewProjection?: Readonly<Matrix>;
}

interface PlanarRenderResource {
  readonly entity: Entity;
  readonly camera: Camera;
  readonly renderTarget: RenderTarget;
  readonly texture: Texture2D;
  readonly viewProjection: Matrix;
  readonly renderTargetProjection: Matrix;
}

export interface WaterReflectionServiceOptions {
  readonly minPlanarResolution?: number;
  readonly maxPlanarResolution?: number;
  readonly planarClipBias?: number;
  readonly minimumCameraPlaneDistance?: number;
  readonly now?: () => number;
  /** Demo/debug adapter; the engine currently exposes no public per-camera draw counter. */
  readonly estimatePlanarDrawCount?: () => number;
  /** Optional non-blocking GPU timer. The service never owns or destroys it. */
  readonly planarGpuTimer?: Pick<WaterGpuTimer, "beginPlanarSample" | "endPlanarSample">;
}

/**
 * Reference-counted access to the one reflection service owned by a source Camera.
 * Each acquisition must release its own lease; release() is idempotent.
 */
export interface WaterReflectionServiceLease {
  readonly service: WaterReflectionService;
  release(): void;
}

interface WaterReflectionServiceRegistryEntry {
  readonly service: WaterReflectionService;
  referenceCount: number;
}

const WATER_REFLECTION_SERVICE_REGISTRY = new WeakMap<Camera, WaterReflectionServiceRegistryEntry>();

export interface WaterReflectionServiceMetrics {
  readonly activeConsumerCount: number;
  readonly planarRequestCount: number;
  readonly eligiblePlanarRequestCount?: number;
  /** Backward-compatible alias for the owner whose texture/VP is currently valid. */
  readonly planarOwnerId?: string;
  readonly selectedPlanarOwnerId?: string;
  readonly pendingPlanarOwnerId?: string;
  readonly pendingPlanarOwnerReason?: WaterReflectionPendingReason;
  readonly renderedPlanarOwnerId?: string;
  readonly waterLayerMask: number;
  readonly planarCameraCullingMask: number;
  readonly waterLayerExcludedFromPlanar: boolean;
  readonly planarOwnerSwitchCount?: number;
  readonly planarOwnerAgeFrames?: number;
  readonly planarOwnerHoldRemainingFrames?: number;
  readonly pendingPlanarOwnerAgeFrames?: number;
  readonly pendingPlanarOwnerConfirmRemainingFrames?: number;
  readonly planarCameraCount: 0 | 1;
  readonly reflectionCameraCreateCount?: number;
  readonly reflectionCameraDestroyCount?: number;
  readonly planarUpdateCount: number;
  readonly planarSkippedUpdateCount: number;
  readonly planarFailureCount: number;
  readonly renderTargetCreateCount: number;
  readonly renderTargetDestroyCount: number;
  readonly liveRenderTargetCount?: 0 | 1;
  readonly renderTargetWidth: number;
  readonly renderTargetHeight: number;
  readonly estimatedRenderTargetBytes: number;
  readonly lastPlanarDrawCount: number;
  readonly totalPlanarDrawCount: number;
  readonly lastPlanarRenderCpuMs: number;
  readonly planarRenderCpuP95Ms: number;
  readonly lastPlanarGpuMs?: number;
  readonly planarGpuSampleCount: number;
}

export class WaterReflectionService {
  /**
   * Acquires the single reflection service associated with sourceCamera.
   * The first acquisition defines its parent and options; later acquisitions must be compatible.
   */
  static acquire(
    engine: Engine,
    parent: Entity,
    sourceCamera: Camera,
    options: WaterReflectionServiceOptions = {}
  ): WaterReflectionServiceLease {
    const existing = WATER_REFLECTION_SERVICE_REGISTRY.get(sourceCamera);
    if (existing) {
      existing.service._assertCompatibleAcquisition(engine, parent, options);
      existing.referenceCount++;
      return existing.service._createLease();
    }

    const service = new WaterReflectionService(engine, parent, sourceCamera, options);
    // The constructor's first registry reference belongs to this lease rather than to a direct owner.
    service._directOwnerState = "none";
    return service._createLease();
  }

  private readonly _requests = new Map<string, WaterReflectionRequest>();
  /** Rebuilt only on request mutation; update() reuses this stable arbitration input. */
  private readonly _requestBuffer: WaterReflectionRequest[] = [];
  private readonly _bindings = new Map<string, MutableWaterReflectionBinding>();
  private readonly _runtimeFallbackReasons = new Map<string, WaterReflectionFallbackReason>();
  private readonly _ownerArbitrator = new WaterReflectionOwnerArbitrator();
  private readonly _availability: { probe: boolean; planar: boolean } = { probe: false, planar: false };
  private readonly _obliqueProjection = new Matrix();
  private readonly _worldPlane = new Plane();
  private readonly _biasedWorldPlane = new Plane();
  private readonly _viewClipPlane = new Plane();
  private readonly _horizontalPlanePoint = new Vector3();
  private readonly _horizontalPlaneNormal = new Vector3(0, 1, 0);
  private readonly _reflectedPosition = new Vector3();
  private readonly _reflectedForward = new Vector3();
  private readonly _reflectedUp = new Vector3();
  private readonly _reflectedTarget = new Vector3();
  private readonly _projectionState = new Float64Array(PROJECTION_STATE_VALUE_COUNT);
  private readonly _lastProjectionState = new Float64Array(PROJECTION_STATE_VALUE_COUNT);
  private readonly _cpuTimings = new Float64Array(CPU_TIMING_CAPACITY);
  private readonly _minPlanarResolution: number;
  private readonly _maxPlanarResolution: number;
  private readonly _planarClipBias: number;
  private readonly _minimumCameraPlaneDistance: number;
  private readonly _now: () => number;
  private readonly _estimatePlanarDrawCount: () => number;
  private readonly _planarGpuTimer?: Pick<WaterGpuTimer, "beginPlanarSample" | "endPlanarSample">;
  private _probeTexture?: TextureCube;
  private _arbitrationState: Readonly<WaterReflectionArbitrationState> = this._ownerArbitrator.state;
  private _selectedPlanarOwnerId?: string;
  private _eligiblePlanarRequestCount = 0;
  private _planarRequestCount = 0;
  private _waterLayerMask = 0;
  private _planDirty = true;
  private _planarHealthy = true;
  private _viewportWidth = 0;
  private _viewportHeight = 0;
  private _activeResource?: PlanarRenderResource;
  private _renderTargetCreateCount = 0;
  private _renderTargetDestroyCount = 0;
  private _reflectionCameraCreateCount = 0;
  private _reflectionCameraDestroyCount = 0;
  private _planarUpdateCount = 0;
  private _planarSkippedUpdateCount = 0;
  private _planarFailureCount = 0;
  private _lastPlanarUpdateFrame = -1;
  private _renderedPlanarOwnerId?: string;
  private _renderCommitPendingOwnerId?: string;
  private _renderCommitPendingAgeFrames = 0;
  private _committedPlanarOwnerId?: string;
  private _planarOwnerSwitchCount = 0;
  private _hasProjectionState = false;
  private _automaticFrameIndex = 0;
  private _lastPlanarDrawCount = 0;
  private _totalPlanarDrawCount = 0;
  private _lastPlanarRenderCpuMs = 0;
  private _cpuTimingCount = 0;
  private _cpuTimingCursor = 0;
  private _lastPlanarGpuMs?: number;
  private _planarGpuSampleCount = 0;
  private _directOwnerState: "active" | "released" | "none" = "active";
  private _destroyed = false;

  constructor(
    private readonly _engine: Engine,
    private readonly _parent: Entity,
    private readonly _sourceCamera: Camera,
    options: WaterReflectionServiceOptions = {}
  ) {
    if (WATER_REFLECTION_SERVICE_REGISTRY.has(_sourceCamera)) {
      throw new Error(
        "A WaterReflectionService already exists for this source Camera. Use WaterReflectionService.acquire() to share it."
      );
    }
    this._minPlanarResolution = Math.max(1, Math.floor(options.minPlanarResolution ?? DEFAULT_MIN_PLANAR_RESOLUTION));
    this._maxPlanarResolution = Math.max(
      this._minPlanarResolution,
      Math.floor(options.maxPlanarResolution ?? DEFAULT_MAX_PLANAR_RESOLUTION)
    );
    this._planarClipBias = this._resolveNonNegativeOption(options.planarClipBias, DEFAULT_PLANAR_CLIP_BIAS);
    this._minimumCameraPlaneDistance = this._resolveNonNegativeOption(
      options.minimumCameraPlaneDistance,
      DEFAULT_MINIMUM_CAMERA_PLANE_DISTANCE
    );
    this._now = options.now ?? (() => performance.now());
    this._estimatePlanarDrawCount = options.estimatePlanarDrawCount ?? (() => 0);
    this._planarGpuTimer = options.planarGpuTimer;
    WATER_REFLECTION_SERVICE_REGISTRY.set(_sourceCamera, {
      service: this,
      referenceCount: 1
    });
  }

  /** Non-hot diagnostic snapshot. Percentile sorting and snapshot freezing intentionally allocate here, never in update(). */
  get metrics(): WaterReflectionServiceMetrics {
    if (this._planDirty) this._rebuildPlan();
    const timings = Array.from(this._cpuTimings.slice(0, this._cpuTimingCount)).sort((a, b) => a - b);
    const p95Index = Math.max(0, Math.ceil(timings.length * 0.95) - 1);
    const arbitrationStateMatchesPlan = this._arbitrationState.selectedOwnerId === this._selectedPlanarOwnerId;
    const pendingOwnerId = arbitrationStateMatchesPlan
      ? (this._arbitrationState.pendingOwnerId ?? this._renderCommitPendingOwnerId)
      : this._renderCommitPendingOwnerId;
    const arbitrationPending = arbitrationStateMatchesPlan && this._arbitrationState.pendingOwnerId !== undefined;
    const activeResource = this._activeResource;
    return Object.freeze({
      activeConsumerCount: this._requests.size,
      planarRequestCount: this._planarRequestCount,
      eligiblePlanarRequestCount: this._eligiblePlanarRequestCount,
      planarOwnerId: this._renderedPlanarOwnerId,
      selectedPlanarOwnerId: this._selectedPlanarOwnerId,
      pendingPlanarOwnerId: pendingOwnerId,
      pendingPlanarOwnerReason: pendingOwnerId
        ? arbitrationStateMatchesPlan
          ? (this._arbitrationState.pendingReason ?? "challenger")
          : "challenger"
        : undefined,
      renderedPlanarOwnerId: this._renderedPlanarOwnerId,
      waterLayerMask: this._waterLayerMask,
      planarCameraCullingMask: activeResource?.camera.cullingMask ?? 0,
      waterLayerExcludedFromPlanar:
        activeResource === undefined || (activeResource.camera.cullingMask & this._waterLayerMask) === 0,
      planarOwnerSwitchCount: this._planarOwnerSwitchCount,
      planarOwnerAgeFrames: arbitrationStateMatchesPlan ? this._arbitrationState.ownerAgeFrames : 0,
      planarOwnerHoldRemainingFrames: arbitrationStateMatchesPlan
        ? this._arbitrationState.ownerMinimumHoldRemainingFrames
        : 0,
      pendingPlanarOwnerAgeFrames: arbitrationPending
        ? this._arbitrationState.pendingOwnerAgeFrames
        : this._renderCommitPendingAgeFrames,
      pendingPlanarOwnerConfirmRemainingFrames: arbitrationPending
        ? this._arbitrationState.pendingOwnerConfirmRemainingFrames
        : 0,
      planarCameraCount: activeResource ? 1 : 0,
      reflectionCameraCreateCount: this._reflectionCameraCreateCount,
      reflectionCameraDestroyCount: this._reflectionCameraDestroyCount,
      planarUpdateCount: this._planarUpdateCount,
      planarSkippedUpdateCount: this._planarSkippedUpdateCount,
      planarFailureCount: this._planarFailureCount,
      renderTargetCreateCount: this._renderTargetCreateCount,
      renderTargetDestroyCount: this._renderTargetDestroyCount,
      liveRenderTargetCount: activeResource ? 1 : 0,
      renderTargetWidth: activeResource?.renderTarget.width ?? 0,
      renderTargetHeight: activeResource?.renderTarget.height ?? 0,
      estimatedRenderTargetBytes:
        (activeResource?.renderTarget.width ?? 0) *
        (activeResource?.renderTarget.height ?? 0) *
        PLANAR_BYTES_PER_PIXEL_ESTIMATE,
      lastPlanarDrawCount: this._lastPlanarDrawCount,
      totalPlanarDrawCount: this._totalPlanarDrawCount,
      lastPlanarRenderCpuMs: this._lastPlanarRenderCpuMs,
      planarRenderCpuP95Ms: timings.length === 0 ? 0 : timings[p95Index],
      lastPlanarGpuMs: this._lastPlanarGpuMs,
      planarGpuSampleCount: this._planarGpuSampleCount
    });
  }

  setViewportSize(width: number, height: number): void {
    const nextWidth = Math.max(0, Math.floor(width));
    const nextHeight = Math.max(0, Math.floor(height));
    if (nextWidth === this._viewportWidth && nextHeight === this._viewportHeight) return;
    this._viewportWidth = nextWidth;
    this._viewportHeight = nextHeight;
    if (nextWidth === 0 || nextHeight === 0) {
      this._destroyActiveResource();
    } else {
      this._hasProjectionState = false;
    }
    this._planDirty = true;
    this._rebuildPlan();
  }

  setProbeTexture(texture?: TextureCube): void {
    if (texture === this._probeTexture) return;
    this._probeTexture = texture;
    this._planDirty = true;
    this._rebuildPlan();
  }

  setRequest(request: WaterReflectionRequest): void {
    if (this._destroyed) throw new Error("Water reflection service has been destroyed.");
    const previousRequest = this._requests.get(request.id);
    const plane = request.plane;
    const normalizedRequest: WaterReflectionRequest = Object.freeze({
      ...request,
      plane: plane
        ? Object.freeze({
            normal: Object.freeze(new Vector3(plane.normal.x, plane.normal.y, plane.normal.z)),
            distance: plane.distance
          })
        : undefined
    });
    this._requests.set(request.id, normalizedRequest);
    this._runtimeFallbackReasons.delete(request.id);
    if (
      request.id === this._renderedPlanarOwnerId &&
      (this._hasRenderedRequestStateChanged(previousRequest, normalizedRequest) ||
        !isWaterReflectionRequestPlanarEligible(normalizedRequest))
    ) {
      this._invalidateRenderedPlanar();
      if (!isWaterReflectionRequestPlanarEligible(normalizedRequest)) {
        this._destroyActiveResource();
      }
    }
    if (!this._bindings.has(request.id)) {
      this._bindings.set(request.id, {
        requestedSource: request.preferredSource,
        resolvedSource: "sky"
      });
    }
    this._planDirty = true;
    this._rebuildPlan();
  }

  removeRequest(requestId: string): boolean {
    if (requestId === this._renderedPlanarOwnerId) {
      this._destroyActiveResource();
    }
    const removed = this._requests.delete(requestId);
    this._bindings.delete(requestId);
    this._runtimeFallbackReasons.delete(requestId);
    if (removed) {
      this._planDirty = true;
      this._rebuildPlan();
    }
    return removed;
  }

  getBinding(requestId: string): Readonly<WaterReflectionBinding> | undefined {
    if (this._planDirty) this._rebuildPlan();
    return this._bindings.get(requestId);
  }

  /** Allows an optional public profiler/debug adapter to attach a resolved GPU timing sample. */
  recordPlanarGpuTime(milliseconds: number): void {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return;
    this._lastPlanarGpuMs = milliseconds;
    this._planarGpuSampleCount++;
  }

  retryPlanar(): void {
    if (this._planarHealthy) return;
    this._planarHealthy = true;
    this._runtimeFallbackReasons.clear();
    this._planDirty = true;
  }

  update(frameIndex = this._automaticFrameIndex++): void {
    if (this._destroyed) return;
    this._advanceArbitration();
    const ownerId = this._selectedPlanarOwnerId;
    const owner = ownerId ? this._requests.get(ownerId) : undefined;
    if (!owner) {
      if (!this._hasHealthyRenderedOwner()) this._destroyActiveResource();
      this._synchronizeBindings();
      return;
    }

    const validationFailure = this._validatePlanarOwner(owner);
    if (validationFailure) {
      this._fallbackPlanarOwner(owner.id, validationFailure, validationFailure === "planar-invalid-plane", false);
      return;
    }

    const policy = WATER_REFLECTION_QUALITY_POLICY[owner.quality];
    if (!policy.planarEnabled) {
      this._fallbackPlanarOwner(owner.id, "planar-unavailable", false, false);
      return;
    }
    const targetWidth = Math.min(
      this._maxPlanarResolution,
      Math.max(this._minPlanarResolution, Math.ceil(this._viewportWidth * policy.planarResolutionScale))
    );
    const targetHeight = Math.min(
      this._maxPlanarResolution,
      Math.max(this._minPlanarResolution, Math.ceil(this._viewportHeight * policy.planarResolutionScale))
    );
    const activeResource = this._activeResource;
    const needsCandidateResource =
      !activeResource ||
      owner.id !== this._renderedPlanarOwnerId ||
      activeResource.renderTarget.width !== targetWidth ||
      activeResource.renderTarget.height !== targetHeight;
    let candidateResource: PlanarRenderResource | undefined;
    try {
      if (needsCandidateResource) candidateResource = this._createPlanarResource(targetWidth, targetHeight);
    } catch {
      this._fallbackPlanarOwner(owner.id, "planar-target-failed", true, true);
      return;
    }
    const renderResource = candidateResource ?? activeResource;
    if (!renderResource) {
      this._fallbackPlanarOwner(owner.id, "planar-target-failed", false, true);
      return;
    }

    const normalizedFrame = Math.max(0, Math.floor(frameIndex));
    const projectionStateChanged = this._writeProjectionState(owner, renderResource);
    const updateDue =
      this._lastPlanarUpdateFrame < 0 ||
      normalizedFrame < this._lastPlanarUpdateFrame ||
      owner.id !== this._renderedPlanarOwnerId ||
      projectionStateChanged ||
      normalizedFrame - this._lastPlanarUpdateFrame >= policy.planarUpdateIntervalFrames;
    if (!updateDue) {
      this._planarSkippedUpdateCount++;
      this._synchronizeBindings();
      return;
    }

    let renderSucceeded: boolean;
    try {
      renderSucceeded = this._renderPlanar(owner, renderResource);
    } catch {
      if (candidateResource) this._destroyResource(candidateResource);
      this._fallbackPlanarOwner(owner.id, "planar-render-failed", true, true);
      return;
    }
    if (!renderSucceeded) {
      if (candidateResource) this._destroyResource(candidateResource);
      this._fallbackPlanarOwner(owner.id, "planar-invalid-projection", true, false);
      return;
    }

    this._lastPlanarUpdateFrame = normalizedFrame;
    if (this._committedPlanarOwnerId && this._committedPlanarOwnerId !== owner.id) {
      this._planarOwnerSwitchCount++;
    }
    this._committedPlanarOwnerId = owner.id;
    const previousResource = candidateResource ? this._activeResource : undefined;
    if (candidateResource) this._activeResource = candidateResource;
    this._renderedPlanarOwnerId = owner.id;
    this._clearRenderCommitPending();
    this._captureProjectionState();
    this._runtimeFallbackReasons.delete(owner.id);
    this._synchronizeBindings();
    if (previousResource && previousResource !== candidateResource) this._destroyResource(previousResource);
  }

  destroy(): void {
    if (this._destroyed) return;
    if (this._directOwnerState === "released") return;
    if (this._directOwnerState === "none") {
      throw new Error("An acquired WaterReflectionService must be released through its WaterReflectionServiceLease.");
    }
    this._directOwnerState = "released";
    this._releaseRegistryReference();
  }

  private _destroyNow(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._destroyActiveResource();
    this._requests.clear();
    this._requestBuffer.length = 0;
    this._bindings.clear();
    this._runtimeFallbackReasons.clear();
    this._ownerArbitrator.reset();
    this._arbitrationState = this._ownerArbitrator.state;
    this._selectedPlanarOwnerId = undefined;
    this._clearRenderCommitPending();
    this._eligiblePlanarRequestCount = 0;
    this._planarRequestCount = 0;
    this._waterLayerMask = 0;
    this._planDirty = false;
  }

  private _createLease(): WaterReflectionServiceLease {
    let released = false;
    return Object.freeze({
      service: this,
      release: (): void => {
        if (released) return;
        released = true;
        this._releaseRegistryReference();
      }
    });
  }

  private _releaseRegistryReference(): void {
    const entry = WATER_REFLECTION_SERVICE_REGISTRY.get(this._sourceCamera);
    if (!entry || entry.service !== this) return;
    entry.referenceCount--;
    if (entry.referenceCount > 0) return;
    WATER_REFLECTION_SERVICE_REGISTRY.delete(this._sourceCamera);
    this._destroyNow();
  }

  private _assertCompatibleAcquisition(engine: Engine, parent: Entity, options: WaterReflectionServiceOptions): void {
    if (this._destroyed) throw new Error("Water reflection service has been destroyed.");
    if (engine !== this._engine || parent !== this._parent) {
      throw new Error(
        "WaterReflectionService.acquire() must reuse the original Engine and parent for a source Camera."
      );
    }
    if (
      options.minPlanarResolution !== undefined &&
      Math.max(1, Math.floor(options.minPlanarResolution)) !== this._minPlanarResolution
    ) {
      throw new Error("WaterReflectionService.acquire() received a conflicting minPlanarResolution.");
    }
    if (
      options.maxPlanarResolution !== undefined &&
      Math.max(this._minPlanarResolution, Math.floor(options.maxPlanarResolution)) !== this._maxPlanarResolution
    ) {
      throw new Error("WaterReflectionService.acquire() received a conflicting maxPlanarResolution.");
    }
    if (
      options.planarClipBias !== undefined &&
      this._resolveNonNegativeOption(options.planarClipBias, DEFAULT_PLANAR_CLIP_BIAS) !== this._planarClipBias
    ) {
      throw new Error("WaterReflectionService.acquire() received a conflicting planarClipBias.");
    }
    if (
      options.minimumCameraPlaneDistance !== undefined &&
      this._resolveNonNegativeOption(options.minimumCameraPlaneDistance, DEFAULT_MINIMUM_CAMERA_PLANE_DISTANCE) !==
        this._minimumCameraPlaneDistance
    ) {
      throw new Error("WaterReflectionService.acquire() received a conflicting minimumCameraPlaneDistance.");
    }
    if (options.now !== undefined && options.now !== this._now) {
      throw new Error("WaterReflectionService.acquire() received a conflicting now callback.");
    }
    if (
      options.estimatePlanarDrawCount !== undefined &&
      options.estimatePlanarDrawCount !== this._estimatePlanarDrawCount
    ) {
      throw new Error("WaterReflectionService.acquire() received a conflicting draw-count callback.");
    }
    if (options.planarGpuTimer !== undefined && options.planarGpuTimer !== this._planarGpuTimer) {
      throw new Error("WaterReflectionService.acquire() received a conflicting planar GPU timer.");
    }
  }

  private _rebuildPlan(): void {
    const availability = this._refreshAvailability();
    let eligiblePlanarRequestCount = 0;
    let planarRequestCount = 0;
    let waterLayerMask = 0;
    let requestIndex = 0;
    for (const request of this._requests.values()) {
      this._requestBuffer[requestIndex++] = request;
      waterLayerMask |= request.waterLayerMask;
      if (request.visible === true && request.preferredSource === "planar") planarRequestCount++;
      if (isWaterReflectionRequestPlanarEligible(request)) eligiblePlanarRequestCount++;
    }
    this._requestBuffer.length = requestIndex;
    const selectedOwnerId = this._arbitrationState.selectedOwnerId;
    const selectedRequest = selectedOwnerId ? this._requests.get(selectedOwnerId) : undefined;
    this._selectedPlanarOwnerId =
      availability.planar && selectedRequest && isWaterReflectionRequestPlanarEligible(selectedRequest)
        ? selectedOwnerId
        : undefined;
    if (!this._selectedPlanarOwnerId || this._selectedPlanarOwnerId === this._renderedPlanarOwnerId) {
      this._clearRenderCommitPending();
    } else if (this._renderCommitPendingOwnerId !== this._selectedPlanarOwnerId) {
      this._renderCommitPendingOwnerId = this._selectedPlanarOwnerId;
      this._renderCommitPendingAgeFrames = 0;
    }
    this._eligiblePlanarRequestCount = eligiblePlanarRequestCount;
    this._planarRequestCount = planarRequestCount;
    this._waterLayerMask = waterLayerMask;
    this._planDirty = false;
    this._synchronizeBindings();
  }

  private _advanceArbitration(): void {
    const availability = this._refreshAvailability();
    this._arbitrationState = this._ownerArbitrator.updateInPlace(this._requestBuffer, availability);
    this._selectedPlanarOwnerId = this._arbitrationState.selectedOwnerId;
    this._advanceRenderCommitPending();
    this._eligiblePlanarRequestCount = this._arbitrationState.eligiblePlanarRequestCount;
    this._planDirty = false;
  }

  private _refreshAvailability(): WaterReflectionAvailability {
    this._availability.probe = this._probeTexture !== undefined;
    this._availability.planar = this._planarHealthy && this._viewportWidth > 0 && this._viewportHeight > 0;
    return this._availability;
  }

  private _synchronizeBindings(): void {
    for (const [requestId, request] of this._requests) {
      const binding = this._bindings.get(requestId);
      if (!binding) continue;
      if (!request.visible) {
        this._synchronizeHiddenBinding(request, binding);
        continue;
      }

      if (request.preferredSource === "sky") {
        this._writeResolvedBinding(binding, "sky", "sky");
        continue;
      }
      if (request.preferredSource === "probe") {
        if (this._probeTexture) this._writeResolvedBinding(binding, "probe", "probe");
        else this._writeResolvedBinding(binding, "probe", "sky", "probe-unavailable");
        continue;
      }

      const runtimeFallback = this._runtimeFallbackReasons.get(requestId);
      if (runtimeFallback) {
        this._writeFallbackBinding(binding, request, runtimeFallback);
        continue;
      }
      const qualityPolicy = WATER_REFLECTION_QUALITY_POLICY[request.quality];
      if (!qualityPolicy?.planarEnabled) {
        this._writeFallbackBinding(binding, request, "low-quality");
        continue;
      }
      if (!this._availability.planar) {
        this._writeFallbackBinding(binding, request, "planar-unavailable");
        continue;
      }
      if (!isWaterReflectionRequestPlanarEligible(request)) {
        this._writeFallbackBinding(binding, request, "planar-ineligible");
        continue;
      }

      const activeResource = this._activeResource;
      if (requestId === this._renderedPlanarOwnerId && activeResource) {
        binding.requestedSource = "planar";
        binding.resolvedSource = "planar";
        binding.fallbackReason = undefined;
        binding.probeTexture = undefined;
        binding.planarTexture = activeResource.texture;
        binding.planarViewProjection = activeResource.viewProjection;
        continue;
      }

      this._writeFallbackBinding(
        binding,
        request,
        requestId === this._selectedPlanarOwnerId ? "planar-unavailable" : "planar-not-selected"
      );
    }
  }

  private _synchronizeHiddenBinding(request: WaterReflectionRequest, binding: MutableWaterReflectionBinding): void {
    if (request.preferredSource === "sky") {
      this._writeResolvedBinding(binding, request.preferredSource, "sky");
    } else if (request.preferredSource === "probe") {
      if (this._probeTexture) this._writeResolvedBinding(binding, request.preferredSource, "probe");
      else this._writeResolvedBinding(binding, request.preferredSource, "sky", "probe-unavailable");
    } else {
      this._writeFallbackBinding(binding, request, "planar-not-visible");
    }
  }

  private _writeFallbackBinding(
    binding: MutableWaterReflectionBinding,
    request: WaterReflectionRequest,
    fallbackReason: WaterReflectionFallbackReason
  ): void {
    this._writeResolvedBinding(binding, request.preferredSource, this._probeTexture ? "probe" : "sky", fallbackReason);
  }

  private _writeResolvedBinding(
    binding: MutableWaterReflectionBinding,
    requestedSource: WaterReflectionSource,
    resolvedSource: WaterReflectionSource,
    fallbackReason?: WaterReflectionFallbackReason
  ): void {
    binding.requestedSource = requestedSource;
    binding.resolvedSource = resolvedSource;
    binding.fallbackReason = fallbackReason;
    binding.probeTexture = resolvedSource === "probe" ? this._probeTexture : undefined;
    binding.planarTexture = undefined;
    binding.planarViewProjection = undefined;
  }

  private _createPlanarResource(width: number, height: number): PlanarRenderResource {
    let texture: Texture2D | undefined;
    let renderTarget: RenderTarget | undefined;
    let entity: Entity | undefined;
    let camera: Camera | undefined;
    try {
      texture = new Texture2D(this._engine, width, height, TextureFormat.R8G8B8A8, false, true);
      texture.filterMode = TextureFilterMode.Bilinear;
      texture.wrapModeU = TextureWrapMode.Clamp;
      texture.wrapModeV = TextureWrapMode.Clamp;
      renderTarget = new RenderTarget(this._engine, width, height, texture, TextureFormat.Depth24, 1);
      this._renderTargetCreateCount++;
      renderTarget.autoGenerateMipmaps = false;
      entity = this._parent.createChild("water-planar-reflection-camera");
      camera = entity.addComponent(Camera);
      camera.enabled = false;
      camera.renderTarget = renderTarget;
      this._reflectionCameraCreateCount++;
      return {
        entity,
        camera,
        renderTarget,
        texture,
        viewProjection: new Matrix(),
        renderTargetProjection: new Matrix()
      };
    } catch (error) {
      if (camera && camera.renderTarget === renderTarget) camera.renderTarget = null;
      if (entity) {
        entity.destroy();
        if (camera) this._reflectionCameraDestroyCount++;
      }
      if (renderTarget) {
        renderTarget.destroy(true);
        this._renderTargetDestroyCount++;
      }
      texture?.destroy(true);
      throw error;
    }
  }

  private _destroyActiveResource(): void {
    this._invalidateRenderedPlanar();
    const resource = this._activeResource;
    this._activeResource = undefined;
    if (resource) this._destroyResource(resource);
  }

  private _destroyResource(resource: PlanarRenderResource): void {
    resource.camera.renderTarget = null;
    resource.renderTarget.destroy(true);
    resource.texture.destroy(true);
    resource.entity.destroy();
    this._renderTargetDestroyCount++;
    this._reflectionCameraDestroyCount++;
  }

  private _validatePlanarOwner(owner: WaterReflectionRequest): WaterReflectionFallbackReason | undefined {
    const source = this._sourceCamera;
    if (source.isOrthographic) return "planar-orthographic-camera";

    const viewport = source.viewport;
    if (
      !Number.isFinite(source.fieldOfView) ||
      source.fieldOfView <= MathUtil.zeroTolerance ||
      source.fieldOfView >= 180 ||
      !Number.isFinite(source.aspectRatio) ||
      source.aspectRatio <= MathUtil.zeroTolerance ||
      !Number.isFinite(source.nearClipPlane) ||
      source.nearClipPlane <= MathUtil.zeroTolerance ||
      !Number.isFinite(source.farClipPlane) ||
      source.farClipPlane <= source.nearClipPlane ||
      !Number.isFinite(viewport.x) ||
      !Number.isFinite(viewport.y) ||
      !Number.isFinite(viewport.z) ||
      !Number.isFinite(viewport.w) ||
      viewport.z <= MathUtil.zeroTolerance ||
      viewport.w <= MathUtil.zeroTolerance
    ) {
      return "planar-invalid-projection";
    }

    if (owner.plane) {
      if (!isNormalizedWorldPlane(owner.plane)) return "planar-invalid-plane";
      this._worldPlane.normal.copyFrom(owner.plane.normal);
      this._worldPlane.distance = owner.plane.distance;
    } else {
      const planeY = owner.planeY;
      if (planeY === undefined || !Number.isFinite(planeY)) return "planar-invalid-plane";
      this._horizontalPlanePoint.set(0, planeY, 0);
      if (!tryCreateNormalizedWorldPlane(this._horizontalPlanePoint, this._horizontalPlaneNormal, this._worldPlane)) {
        return "planar-invalid-plane";
      }
    }

    const clipBias = owner.clipBias ?? this._planarClipBias;
    if (!Number.isFinite(clipBias) || clipBias < 0) return "planar-invalid-plane";
    this._biasedWorldPlane.normal.copyFrom(this._worldPlane.normal);
    this._biasedWorldPlane.distance = this._worldPlane.distance - clipBias;
    if (!isNormalizedWorldPlane(this._biasedWorldPlane)) return "planar-invalid-plane";

    const sourceTransform = source.entity.transform;
    const cameraDistance = signedDistanceToNormalizedPlane(sourceTransform.worldPosition, this._worldPlane);
    if (!Number.isFinite(cameraDistance)) return "planar-invalid-projection";
    if (Math.abs(cameraDistance) <= this._minimumCameraPlaneDistance) return "planar-camera-too-close";
    if (cameraDistance < 0) return "planar-camera-underwater";

    const forward = sourceTransform.worldForward;
    const forwardLengthSquared = forward.x * forward.x + forward.y * forward.y + forward.z * forward.z;
    if (!Number.isFinite(forwardLengthSquared) || forwardLengthSquared <= MathUtil.zeroTolerance ** 2) {
      return "planar-invalid-projection";
    }
    const forwardPlaneDot =
      forward.x * this._worldPlane.normal.x +
      forward.y * this._worldPlane.normal.y +
      forward.z * this._worldPlane.normal.z;
    if (!Number.isFinite(forwardPlaneDot)) return "planar-invalid-projection";
    if (forwardPlaneDot > PLANAR_BACK_FACE_EPSILON) return "planar-plane-back-facing";
    return undefined;
  }

  private _writeProjectionState(owner: WaterReflectionRequest, resource: PlanarRenderResource): boolean {
    const source = this._sourceCamera;
    const viewport = source.viewport;
    const state = this._projectionState;
    state[0] = source.fieldOfView;
    state[1] = source.aspectRatio;
    state[2] = source.nearClipPlane;
    state[3] = source.farClipPlane;
    state[4] = viewport.x;
    state[5] = viewport.y;
    state[6] = viewport.z;
    state[7] = viewport.w;
    state[8] = this._viewportWidth;
    state[9] = this._viewportHeight;
    state[10] = resource.renderTarget.width;
    state[11] = resource.renderTarget.height;
    state[12] = this._worldPlane.normal.x;
    state[13] = this._worldPlane.normal.y;
    state[14] = this._worldPlane.normal.z;
    state[15] = this._worldPlane.distance;
    state[16] = owner.clipBias ?? this._planarClipBias;
    state[17] = owner.obliqueClipEnabled === false ? 0 : 1;
    if (!this._hasProjectionState) return true;
    for (let index = 0; index < PROJECTION_STATE_VALUE_COUNT; index++) {
      if (!Number.isFinite(state[index]) || state[index] !== this._lastProjectionState[index]) return true;
    }
    return false;
  }

  private _captureProjectionState(): void {
    this._lastProjectionState.set(this._projectionState);
    this._hasProjectionState = true;
  }

  private _renderPlanar(owner: WaterReflectionRequest, resource: PlanarRenderResource): boolean {
    const source = this._sourceCamera;
    const target = resource.camera;
    const targetEntity = resource.entity;
    target.resetProjectionMatrix();
    target.fieldOfView = source.fieldOfView;
    target.isOrthographic = false;
    target.orthographicSize = source.orthographicSize;
    target.nearClipPlane = source.nearClipPlane;
    target.farClipPlane = source.farClipPlane;
    target.aspectRatio = source.aspectRatio;
    target.viewport = source.viewport;
    target.clearFlags = source.clearFlags;
    target.enableHDR = false;
    target.enablePostProcess = false;
    target.cullingMask = (owner.cullingMask & ~this._waterLayerMask) as Layer;

    const sourceTransform = source.entity.transform;
    const sourcePosition = sourceTransform.worldPosition;
    const sourceForward = sourceTransform.worldForward;
    const sourceUp = sourceTransform.worldUp;
    if (
      !tryReflectPointAcrossPlane(sourcePosition, this._worldPlane, this._reflectedPosition) ||
      !tryReflectVectorAcrossPlane(sourceForward, this._worldPlane, this._reflectedForward) ||
      !tryReflectVectorAcrossPlane(sourceUp, this._worldPlane, this._reflectedUp)
    ) {
      return false;
    }
    const forwardLengthSquared =
      this._reflectedForward.x * this._reflectedForward.x +
      this._reflectedForward.y * this._reflectedForward.y +
      this._reflectedForward.z * this._reflectedForward.z;
    const upLengthSquared =
      this._reflectedUp.x * this._reflectedUp.x +
      this._reflectedUp.y * this._reflectedUp.y +
      this._reflectedUp.z * this._reflectedUp.z;
    const crossX = this._reflectedForward.y * this._reflectedUp.z - this._reflectedForward.z * this._reflectedUp.y;
    const crossY = this._reflectedForward.z * this._reflectedUp.x - this._reflectedForward.x * this._reflectedUp.z;
    const crossZ = this._reflectedForward.x * this._reflectedUp.y - this._reflectedForward.y * this._reflectedUp.x;
    const crossLengthSquared = crossX * crossX + crossY * crossY + crossZ * crossZ;
    if (
      !Number.isFinite(forwardLengthSquared) ||
      forwardLengthSquared <= MathUtil.zeroTolerance ** 2 ||
      !Number.isFinite(upLengthSquared) ||
      upLengthSquared <= MathUtil.zeroTolerance ** 2 ||
      !Number.isFinite(crossLengthSquared) ||
      crossLengthSquared <= MathUtil.zeroTolerance ** 2
    ) {
      return false;
    }
    Vector3.add(this._reflectedPosition, this._reflectedForward, this._reflectedTarget);
    targetEntity.transform.setPosition(this._reflectedPosition.x, this._reflectedPosition.y, this._reflectedPosition.z);
    targetEntity.transform.lookAt(this._reflectedTarget, this._reflectedUp);

    if (owner.obliqueClipEnabled !== false) {
      if (
        !tryTransformPlaneToViewSpace(this._biasedWorldPlane, target.viewMatrix, this._viewClipPlane) ||
        !tryCreateObliquePerspectiveProjection(target.projectionMatrix, this._viewClipPlane, this._obliqueProjection)
      ) {
        return false;
      }
      target.projectionMatrix = this._obliqueProjection;
    }

    const gpuQuery = this._planarGpuTimer?.beginPlanarSample();
    const start = this._now();
    try {
      target.render();
    } finally {
      if (gpuQuery) this._planarGpuTimer?.endPlanarSample(gpuQuery);
    }
    const duration = Math.max(0, this._now() - start);
    // RenderContext applies this same flip to render-target cameras. Keep it once in the sampling VP.
    Matrix.multiply(RENDER_TARGET_FLIP_Y, target.projectionMatrix, resource.renderTargetProjection);
    Matrix.multiply(resource.renderTargetProjection, target.viewMatrix, resource.viewProjection);
    this._lastPlanarRenderCpuMs = duration;
    this._cpuTimings[this._cpuTimingCursor] = duration;
    this._cpuTimingCursor = (this._cpuTimingCursor + 1) % CPU_TIMING_CAPACITY;
    this._cpuTimingCount = Math.min(CPU_TIMING_CAPACITY, this._cpuTimingCount + 1);
    this._lastPlanarDrawCount = Math.max(0, Math.floor(this._estimatePlanarDrawCount()));
    this._totalPlanarDrawCount += this._lastPlanarDrawCount;
    this._planarUpdateCount++;
    return true;
  }

  private _fallbackPlanarOwner(
    ownerId: string,
    reason: WaterReflectionFallbackReason,
    countFailure: boolean,
    disablePlanar: boolean
  ): void {
    if (countFailure) this._planarFailureCount++;
    this._runtimeFallbackReasons.set(ownerId, reason);
    const healthyRenderedOwner = this._hasHealthyRenderedOwner();
    const preserveActiveOwner = healthyRenderedOwner && this._renderedPlanarOwnerId !== ownerId;
    if (disablePlanar && !preserveActiveOwner) {
      this._planarHealthy = false;
      this._planDirty = true;
    }
    if (!preserveActiveOwner) this._destroyActiveResource();
    if (this._planDirty) this._rebuildPlan();
    else this._synchronizeBindings();
  }

  private _hasHealthyRenderedOwner(): boolean {
    const renderedOwnerId = this._renderedPlanarOwnerId;
    if (!renderedOwnerId || !this._activeResource || !this._availability.planar) return false;
    const request = this._requests.get(renderedOwnerId);
    return request !== undefined && isWaterReflectionRequestPlanarEligible(request);
  }

  private _advanceRenderCommitPending(): void {
    const selectedOwnerId = this._selectedPlanarOwnerId;
    if (!selectedOwnerId || selectedOwnerId === this._renderedPlanarOwnerId) {
      this._clearRenderCommitPending();
      return;
    }
    if (this._renderCommitPendingOwnerId === selectedOwnerId) {
      this._renderCommitPendingAgeFrames++;
    } else {
      this._renderCommitPendingOwnerId = selectedOwnerId;
      this._renderCommitPendingAgeFrames = 1;
    }
  }

  private _clearRenderCommitPending(): void {
    this._renderCommitPendingOwnerId = undefined;
    this._renderCommitPendingAgeFrames = 0;
  }

  private _invalidateRenderedPlanar(): void {
    this._lastPlanarUpdateFrame = -1;
    this._renderedPlanarOwnerId = undefined;
    this._hasProjectionState = false;
    for (const [requestId, binding] of this._bindings) {
      if (!binding.planarTexture && !binding.planarViewProjection) continue;
      const request = this._requests.get(requestId);
      if (!request) {
        binding.planarTexture = undefined;
        binding.planarViewProjection = undefined;
        continue;
      }
      if (!request.visible) this._synchronizeHiddenBinding(request, binding);
      else if (request.preferredSource === "sky") this._writeResolvedBinding(binding, "sky", "sky");
      else if (request.preferredSource === "probe") {
        if (this._probeTexture) this._writeResolvedBinding(binding, "probe", "probe");
        else this._writeResolvedBinding(binding, "probe", "sky", "probe-unavailable");
      } else this._writeFallbackBinding(binding, request, "planar-unavailable");
    }
  }

  private _hasRenderedRequestStateChanged(
    previous: WaterReflectionRequest | undefined,
    next: WaterReflectionRequest
  ): boolean {
    if (!previous) return true;
    const previousPlane = previous.plane;
    const nextPlane = next.plane;
    const planeChanged =
      previousPlane === undefined
        ? nextPlane !== undefined
        : nextPlane === undefined ||
          previousPlane.normal.x !== nextPlane.normal.x ||
          previousPlane.normal.y !== nextPlane.normal.y ||
          previousPlane.normal.z !== nextPlane.normal.z ||
          previousPlane.distance !== nextPlane.distance;
    return (
      previous.preferredSource !== next.preferredSource ||
      previous.quality !== next.quality ||
      previous.visible !== next.visible ||
      previous.planarEligible !== next.planarEligible ||
      previous.planeY !== next.planeY ||
      planeChanged ||
      previous.clipBias !== next.clipBias ||
      previous.obliqueClipEnabled !== next.obliqueClipEnabled ||
      previous.cullingMask !== next.cullingMask ||
      previous.waterLayerMask !== next.waterLayerMask
    );
  }

  private _resolveNonNegativeOption(value: number | undefined, fallback: number): number {
    return value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback;
  }
}
