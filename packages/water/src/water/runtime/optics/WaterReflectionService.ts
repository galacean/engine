/** Per-camera reflection binding owner for shared environment and SSR resources. */
import { Camera, Engine, Entity, TextureCube } from "@galacean/engine-core";
import {
  normalizeWaterReflectionRequestPolicy,
  resolveWaterReflectionAvailableMode,
  waterReflectionPolicyModeToSource,
  waterReflectionRequestMode,
  waterReflectionRequestSource,
  type WaterReflectionFallbackReason,
  type WaterReflectionRequest,
  type WaterReflectionResolution,
  type WaterReflectionSource
} from "./WaterReflectionPolicy";
import type { WaterReflectionPolicyMode } from "../../authoring/optics/WaterReflectionPolicy";
import type {
  WaterEnvironmentReflectionFrame,
  WaterEnvironmentReflectionProviderRequest
} from "./WaterEnvironmentReflectionTypes";
import {
  isValidWaterEnvironmentReflectionFrame,
  isValidWaterEnvironmentReflectionProjection
} from "./WaterEnvironmentReflectionTypes";

type WaterCameraScreenSpaceReflectionAvailability = Pick<
  Camera["screenSpaceReflection"],
  "effective" | "supported" | "unsupportedReason" | "metrics"
>;

function cameraScreenSpaceReflection(
  camera: Camera
): Readonly<WaterCameraScreenSpaceReflectionAvailability> | undefined {
  return (camera as unknown as { readonly screenSpaceReflection?: WaterCameraScreenSpaceReflectionAvailability })
    .screenSpaceReflection;
}

export interface WaterReflectionBinding {
  /** Monotonic semantic revision; advances only when shader-visible state changes. */
  readonly bindingRevision?: number;
  readonly requestedSource: WaterReflectionSource;
  readonly resolvedSource: WaterReflectionSource;
  readonly requestedMode?: WaterReflectionPolicyMode;
  readonly resolvedMode?: WaterReflectionPolicyMode;
  readonly fallbackReason?: WaterReflectionResolution["fallbackReason"];
  readonly composition?: WaterReflectionComposition;
  readonly environment?: Readonly<WaterEnvironmentReflectionFrame>;
  readonly localEnvironment?: Readonly<WaterEnvironmentReflectionFrame>;
  readonly probeTexture?: TextureCube;
}

export type WaterReflectionComposition = "analytic" | "environment" | "ssr-over-environment";

interface MutableWaterReflectionBinding {
  bindingRevision: number;
  requestedSource: WaterReflectionSource;
  resolvedSource: WaterReflectionSource;
  requestedMode?: WaterReflectionPolicyMode;
  resolvedMode?: WaterReflectionPolicyMode;
  fallbackReason?: WaterReflectionResolution["fallbackReason"];
  composition?: WaterReflectionComposition;
  environment?: Readonly<WaterEnvironmentReflectionFrame>;
  localEnvironment?: Readonly<WaterEnvironmentReflectionFrame>;
  probeTexture?: TextureCube;
}

/** Reserved for future shared reflection-service options. */
export interface WaterReflectionServiceOptions {}

/** Reference-counted access to the single reflection service owned by a Camera. */
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
  readonly environmentProviderCount: number;
  readonly selectedEnvironmentProviderId?: string;
  readonly selectedLocalEnvironmentProviderId?: string;
  readonly environmentAvailable: boolean;
  readonly distantEnvironmentAvailable: boolean;
  readonly localEnvironmentAvailable: boolean;
  readonly ssrAvailable: boolean;
  readonly ssrSupported: boolean;
  readonly ssrUnsupportedReason?: string | null;
  /** Environment cubemaps remain scene-owned and are only borrowed here. */
  readonly borrowedEnvironmentTextureCount: number;
  readonly ownedEnvironmentTextureCount: 0;
  readonly boundEnvironmentConsumerCount: number;
  readonly environmentRotationDegrees: number;
  readonly environmentExposure: number;
  readonly environmentIntensity: number;
  readonly environmentColorSpace?: "linear" | "srgb";
  readonly environmentHDR: boolean;
  readonly environmentMaximumMipLevel: number;
  readonly environmentRevision: number;
  readonly environmentSecondaryWeight: number;
  readonly environmentSecondaryMaximumMipLevel: number;
  readonly environmentProjectionMode: "infinite" | "box";
  readonly environmentProbePosition?: readonly [x: number, y: number, z: number];
  readonly environmentBoxMinimum?: readonly [x: number, y: number, z: number];
  readonly environmentBoxMaximum?: readonly [x: number, y: number, z: number];
  readonly composition: WaterReflectionComposition;
}

export class WaterReflectionService {
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
    service._directOwnerState = "none";
    return service._createLease();
  }

  private readonly _requestList: WaterReflectionRequest[] = [];
  private readonly _bindingList: MutableWaterReflectionBinding[] = [];
  private readonly _requestIndexById = new Map<string, number>();
  private readonly _requestRevisions = new Map<string, number>();
  private readonly _bindings = new Map<string, MutableWaterReflectionBinding>();
  private readonly _environmentProviders = new Map<string, WaterEnvironmentReflectionProviderRequest>();
  private readonly _environmentProviderRevisions = new Map<string, number>();
  private readonly _availability: { probe: boolean; ssr: boolean } = { probe: false, ssr: false };
  private _probeTexture?: TextureCube;
  private _environmentBinding?: Readonly<WaterEnvironmentReflectionFrame>;
  private _selectedEnvironmentProviderId?: string;
  private _localEnvironmentBinding?: Readonly<WaterEnvironmentReflectionFrame>;
  private _selectedLocalEnvironmentProviderId?: string;
  private _directOwnerState: "active" | "released" | "none" = "active";
  private _nextRequestRevision = 1;
  private _nextBindingRevision = 1;
  private _destroyed = false;

  constructor(
    private readonly _engine: Engine,
    private readonly _parent: Entity,
    private readonly _sourceCamera: Camera,
    _options: WaterReflectionServiceOptions = {}
  ) {
    if (WATER_REFLECTION_SERVICE_REGISTRY.has(_sourceCamera)) {
      throw new Error(
        "A WaterReflectionService already exists for this source Camera. Use WaterReflectionService.acquire() to share it."
      );
    }
    WATER_REFLECTION_SERVICE_REGISTRY.set(_sourceCamera, { service: this, referenceCount: 1 });
  }

  get metrics(): WaterReflectionServiceMetrics {
    this.update();
    let boundEnvironmentConsumerCount = 0;
    let hasVisibleSsrBinding = false;
    const requests = this._requestList;
    const bindings = this._bindingList;
    for (let index = 0; index < requests.length; index++) {
      const request = requests[index]!;
      const binding = bindings[index]!;
      if (request.visible && (binding.environment !== undefined || binding.localEnvironment !== undefined)) {
        boundEnvironmentConsumerCount++;
      }
      if (request.visible && binding.resolvedSource === "ssr") {
        hasVisibleSsrBinding = true;
      }
    }
    const environment = this._environmentBinding;
    const localEnvironment = this._localEnvironmentBinding;
    const primaryEnvironment = environment?.primary;
    const screenSpaceReflection = cameraScreenSpaceReflection(this._sourceCamera);
    return Object.freeze({
      activeConsumerCount: requests.length,
      environmentProviderCount: this._environmentProviders.size,
      selectedEnvironmentProviderId: this._selectedEnvironmentProviderId,
      selectedLocalEnvironmentProviderId: this._selectedLocalEnvironmentProviderId,
      environmentAvailable: environment !== undefined || localEnvironment !== undefined,
      distantEnvironmentAvailable: environment !== undefined,
      localEnvironmentAvailable: localEnvironment !== undefined,
      ssrAvailable: this._availability.ssr,
      ssrSupported: screenSpaceReflection?.supported ?? false,
      ssrUnsupportedReason: screenSpaceReflection
        ? screenSpaceReflection.unsupportedReason
        : "camera-screen-space-reflection-unavailable",
      borrowedEnvironmentTextureCount:
        (environment ? (environment.secondary ? 2 : 1) : 0) +
        (localEnvironment ? (localEnvironment.secondary ? 2 : 1) : 0),
      ownedEnvironmentTextureCount: 0,
      boundEnvironmentConsumerCount,
      environmentRotationDegrees: primaryEnvironment?.rotationDegrees ?? 0,
      environmentExposure: primaryEnvironment?.exposure ?? 0,
      environmentIntensity: primaryEnvironment?.intensity ?? 0,
      environmentColorSpace: primaryEnvironment?.colorSpace,
      environmentHDR: primaryEnvironment?.hdr ?? false,
      environmentMaximumMipLevel: primaryEnvironment?.maximumMipLevel ?? 0,
      environmentRevision: environment?.revision ?? 0,
      environmentSecondaryWeight: environment?.secondaryWeight ?? 0,
      environmentSecondaryMaximumMipLevel: environment?.secondary?.maximumMipLevel ?? 0,
      environmentProjectionMode: primaryEnvironment?.projection?.mode ?? "infinite",
      environmentProbePosition: primaryEnvironment?.projection?.probePosition,
      environmentBoxMinimum: primaryEnvironment?.projection?.boxMinimum,
      environmentBoxMaximum: primaryEnvironment?.projection?.boxMaximum,
      composition: hasVisibleSsrBinding
        ? "ssr-over-environment"
        : environment || localEnvironment
          ? "environment"
          : "analytic"
    });
  }

  setEnvironmentProvider(request: WaterEnvironmentReflectionProviderRequest): number {
    if (this._destroyed) throw new Error("Water reflection service has been destroyed.");
    const normalized = this._normalizeEnvironmentProviderRequest(request);
    this._environmentProviders.set(normalized.id, normalized);
    const revision = this._nextRequestRevision++;
    this._environmentProviderRevisions.set(normalized.id, revision);
    this._selectEnvironmentBinding();
    this._refreshAvailability();
    this._synchronizeBindings();
    return revision;
  }

  removeEnvironmentProvider(providerId: string, expectedRevision?: number): boolean {
    if (expectedRevision !== undefined && this._environmentProviderRevisions.get(providerId) !== expectedRevision) {
      return false;
    }
    const removed = this._environmentProviders.delete(providerId);
    this._environmentProviderRevisions.delete(providerId);
    if (!removed) return false;
    this._selectEnvironmentBinding();
    this._refreshAvailability();
    this._synchronizeBindings();
    return true;
  }

  setRequest(request: WaterReflectionRequest): number {
    if (this._destroyed) throw new Error("Water reflection service has been destroyed.");
    const normalizedRequest: WaterReflectionRequest = Object.freeze({
      ...request,
      policy: normalizeWaterReflectionRequestPolicy(request)
    });
    let binding = this._bindings.get(request.id);
    if (!binding) {
      binding = {
        bindingRevision: this._nextBindingRevision++,
        requestedSource: waterReflectionRequestSource(normalizedRequest),
        resolvedSource: "sky"
      };
      this._bindings.set(request.id, binding);
    }
    const requestIndex = this._requestIndexById.get(request.id);
    if (requestIndex === undefined) {
      this._requestIndexById.set(request.id, this._requestList.length);
      this._requestList.push(normalizedRequest);
      this._bindingList.push(binding);
    } else {
      this._requestList[requestIndex] = normalizedRequest;
      this._bindingList[requestIndex] = binding;
    }
    const revision = this._nextRequestRevision++;
    this._requestRevisions.set(request.id, revision);
    this._refreshAvailability();
    this._synchronizeBindings();
    return revision;
  }

  removeRequest(requestId: string, expectedRevision?: number): boolean {
    if (expectedRevision !== undefined && this._requestRevisions.get(requestId) !== expectedRevision) return false;
    const requestIndex = this._requestIndexById.get(requestId);
    const removed = requestIndex !== undefined;
    this._requestRevisions.delete(requestId);
    this._bindings.delete(requestId);
    if (requestIndex !== undefined) {
      const lastIndex = this._requestList.length - 1;
      if (requestIndex !== lastIndex) {
        const lastRequest = this._requestList[lastIndex]!;
        this._requestList[requestIndex] = lastRequest;
        this._bindingList[requestIndex] = this._bindingList[lastIndex]!;
        this._requestIndexById.set(lastRequest.id, requestIndex);
      }
      this._requestList.length = lastIndex;
      this._bindingList.length = lastIndex;
      this._requestIndexById.delete(requestId);
      this.update();
    }
    return removed;
  }

  /** Returns the binding published by request changes and the Camera pre-render update. */
  getBinding(requestId: string): Readonly<WaterReflectionBinding> | undefined {
    return this._bindings.get(requestId);
  }

  update(_frameIndex?: number): void {
    if (this._destroyed) return;
    if (this._refreshAvailability()) this._synchronizeBindings();
  }

  destroy(): void {
    if (this._destroyed || this._directOwnerState === "released") return;
    if (this._directOwnerState === "none") {
      throw new Error("An acquired WaterReflectionService must be released through its WaterReflectionServiceLease.");
    }
    this._directOwnerState = "released";
    this._releaseRegistryReference();
  }

  private _destroyNow(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._requestList.length = 0;
    this._bindingList.length = 0;
    this._requestIndexById.clear();
    this._requestRevisions.clear();
    this._bindings.clear();
    this._environmentProviders.clear();
    this._environmentProviderRevisions.clear();
    this._environmentBinding = undefined;
    this._selectedEnvironmentProviderId = undefined;
    this._localEnvironmentBinding = undefined;
    this._selectedLocalEnvironmentProviderId = undefined;
    this._probeTexture = undefined;
    this._availability.probe = false;
    this._availability.ssr = false;
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

  private _assertCompatibleAcquisition(engine: Engine, parent: Entity, _options: WaterReflectionServiceOptions): void {
    if (this._destroyed) throw new Error("Water reflection service has been destroyed.");
    if (engine !== this._engine || parent !== this._parent) {
      throw new Error(
        "WaterReflectionService.acquire() must reuse the original Engine and parent for a source Camera."
      );
    }
  }

  private _normalizeEnvironmentProviderRequest(
    request: WaterEnvironmentReflectionProviderRequest
  ): WaterEnvironmentReflectionProviderRequest {
    const id = request.id.trim();
    if (!id) throw new Error("Water environment provider id must be non-empty.");
    if (!Number.isFinite(request.priority)) {
      throw new RangeError("Water environment provider priority must be finite.");
    }
    if (typeof request.active !== "boolean") {
      throw new TypeError("Water environment provider active must be boolean.");
    }
    const binding = request.binding;
    const role = request.role ?? (binding?.projection?.mode === "box" ? "local-probe" : "distant-environment");
    if (role !== "distant-environment" && role !== "local-probe") {
      throw new TypeError("Water environment provider role must be distant-environment or local-probe.");
    }
    if (binding) {
      if (
        binding.providerId !== id ||
        (binding.role !== undefined && binding.role !== role) ||
        !binding.texture ||
        binding.ownership !== "borrowed" ||
        !Number.isFinite(binding.rotationDegrees) ||
        !Number.isFinite(binding.exposure) ||
        binding.exposure < 0 ||
        !Number.isFinite(binding.intensity) ||
        binding.intensity < 0 ||
        (binding.colorSpace !== "linear" && binding.colorSpace !== "srgb") ||
        typeof binding.hdr !== "boolean" ||
        !Number.isInteger(binding.maximumMipLevel) ||
        binding.maximumMipLevel < 0 ||
        (binding.projection !== undefined && !isValidWaterEnvironmentReflectionProjection(binding.projection))
      ) {
        throw new TypeError(`Water environment provider '${id}' has an invalid borrowed binding.`);
      }
    }
    const frame =
      request.frame ??
      (binding
        ? Object.freeze({ providerId: id, role, revision: 0, primary: binding, secondaryWeight: 0 })
        : undefined);
    if (frame && (frame.providerId !== id || frame.role !== role || !isValidWaterEnvironmentReflectionFrame(frame))) {
      throw new TypeError(`Water environment provider '${id}' has an invalid reflection frame.`);
    }
    return Object.freeze({ id, role, priority: request.priority, active: request.active, binding, frame });
  }

  private _selectEnvironmentBinding(): void {
    let selected: WaterEnvironmentReflectionProviderRequest | undefined;
    let selectedLocal: WaterEnvironmentReflectionProviderRequest | undefined;
    for (const request of this._environmentProviders.values()) {
      if (!request.active || !request.frame) continue;
      const current = request.role === "local-probe" ? selectedLocal : selected;
      if (
        !current ||
        request.priority > current.priority ||
        (request.priority === current.priority && request.id < current.id)
      ) {
        if (request.role === "local-probe") selectedLocal = request;
        else selected = request;
      }
    }
    this._localEnvironmentBinding = selectedLocal?.frame;
    this._selectedLocalEnvironmentProviderId = selectedLocal?.id;
    this._environmentBinding = selected?.frame;
    this._selectedEnvironmentProviderId = selected?.id;
    this._probeTexture = selected?.frame?.primary.texture ?? selectedLocal?.frame?.primary.texture;
  }

  private _refreshAvailability(): boolean {
    const probe = this._probeTexture !== undefined;
    const screenSpaceReflection = cameraScreenSpaceReflection(this._sourceCamera);
    const metrics = screenSpaceReflection?.metrics;
    const requested = screenSpaceReflection !== undefined && metrics?.requested === true;
    const hasVisibleRecoveryReceiver = this._hasVisibleSsrRecoveryRequest();
    const positiveIntensity = (metrics?.resolvedSettings.intensity ?? 0) > 0;
    const awaitingFirstCapabilityFrame =
      requested &&
      hasVisibleRecoveryReceiver &&
      positiveIntensity &&
      screenSpaceReflection.supported === false &&
      screenSpaceReflection.unsupportedReason === null;
    const recoveringSupportedReceiver =
      requested &&
      hasVisibleRecoveryReceiver &&
      positiveIntensity &&
      screenSpaceReflection.supported === true &&
      (metrics.inactiveReason === null ||
        metrics.inactiveReason === "not-requested" ||
        metrics.inactiveReason === "zero-intensity" ||
        metrics.inactiveReason === "no-compatible-receivers");
    const ssr =
      screenSpaceReflection?.effective === true || awaitingFirstCapabilityFrame || recoveringSupportedReceiver;
    const changed = this._availability.probe !== probe || this._availability.ssr !== ssr;
    this._availability.probe = probe;
    this._availability.ssr = ssr;
    return changed;
  }

  private _hasVisibleSsrRecoveryRequest(): boolean {
    const requests = this._requestList;
    for (let index = 0; index < requests.length; index++) {
      const request = requests[index]!;
      if (request.visible && request.ssrEligible === true && waterReflectionRequestMode(request) === "ssr") return true;
    }
    return false;
  }

  private _synchronizeBindings(): void {
    const requests = this._requestList;
    const bindings = this._bindingList;
    for (let index = 0; index < requests.length; index++) {
      const request = requests[index]!;
      const binding = bindings[index]!;
      if (this._synchronizeBinding(request, binding)) binding.bindingRevision = this._nextBindingRevision++;
    }
  }

  private _synchronizeBinding(request: WaterReflectionRequest, binding: MutableWaterReflectionBinding): boolean {
    const preferredMode = waterReflectionRequestMode(request);
    const ssrEligible = request.ssrEligible === true && (request.visible || preferredMode !== "ssr");
    const resolvedMode = resolveWaterReflectionAvailableMode(request, this._availability, ssrEligible) ?? "analytic";
    return this._writeResolvedBinding(
      binding,
      request,
      resolvedMode,
      this._resolveUnavailableFallbackReason(request, resolvedMode)
    );
  }

  private _writeResolvedBinding(
    binding: MutableWaterReflectionBinding,
    request: WaterReflectionRequest,
    resolvedMode: WaterReflectionPolicyMode,
    fallbackReason?: WaterReflectionFallbackReason
  ): boolean {
    const requestedMode = waterReflectionRequestMode(request);
    const resolvedSource = waterReflectionPolicyModeToSource(resolvedMode);
    const composition =
      resolvedMode === "environment" ? "environment" : resolvedMode === "ssr" ? "ssr-over-environment" : "analytic";
    const usesEnvironment = resolvedMode === "environment" || resolvedMode === "ssr";
    const environment = usesEnvironment ? this._environmentBinding : undefined;
    const localEnvironment = usesEnvironment ? this._localEnvironmentBinding : undefined;
    const probeTexture = usesEnvironment
      ? (this._environmentBinding?.primary.texture ?? this._localEnvironmentBinding?.primary.texture)
      : undefined;
    const requestedSource = waterReflectionRequestSource(request);
    const changed =
      binding.requestedSource !== requestedSource ||
      binding.resolvedSource !== resolvedSource ||
      binding.requestedMode !== requestedMode ||
      binding.resolvedMode !== resolvedMode ||
      binding.fallbackReason !== fallbackReason ||
      binding.composition !== composition ||
      binding.environment !== environment ||
      binding.localEnvironment !== localEnvironment ||
      binding.probeTexture !== probeTexture;
    if (!changed) return false;
    binding.requestedSource = requestedSource;
    binding.resolvedSource = resolvedSource;
    binding.requestedMode = requestedMode;
    binding.resolvedMode = resolvedMode;
    binding.fallbackReason = fallbackReason;
    binding.composition = composition;
    binding.environment = environment;
    binding.localEnvironment = localEnvironment;
    binding.probeTexture = probeTexture;
    return true;
  }

  private _resolveUnavailableFallbackReason(
    request: WaterReflectionRequest,
    availableMode: WaterReflectionPolicyMode
  ): WaterReflectionFallbackReason | undefined {
    const preferredMode = waterReflectionRequestMode(request);
    if (availableMode === preferredMode) return undefined;
    if (preferredMode === "environment") return "environment-unavailable";
    if (preferredMode === "ssr") {
      return request.ssrEligible === true ? "ssr-unavailable" : "receiver-unsupported";
    }
    return undefined;
  }
}
