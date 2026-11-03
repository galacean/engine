/** Shared backend-owned request, binding refresh, replacement, and cleanup lifecycle. */
import type { WaterReflectionBinding, WaterReflectionService } from "./WaterReflectionService";
import type { WaterReflectionMode } from "../../authoring/body/WaterBodyAuthoringTypes";
import {
  type WaterReflectionPolicyMode,
  type WaterReflectionPolicy,
  type WaterReflectionPresentationMode
} from "../../authoring/optics/WaterReflectionPolicy";
import {
  normalizeWaterReflectionRequestPolicy,
  waterReflectionRequestMode,
  type WaterReflectionRequest
} from "./WaterReflectionPolicy";

export type WaterReflectionBindingService = Pick<WaterReflectionService, "setRequest" | "removeRequest" | "getBinding">;

export interface WaterReflectionBindingLifecycleOptions {
  readonly service: WaterReflectionBindingService;
  readonly request: WaterReflectionRequest;
  readonly activationMode?: "initial" | "replacement-staging";
  readonly applyBinding: (binding?: Readonly<WaterReflectionBinding>) => void;
}

export interface WaterReflectionBindingLifecycleInspection {
  readonly active: boolean;
  readonly published: boolean;
  readonly currentOwner: boolean;
  readonly requestId: string;
  readonly requestRevision?: number;
  readonly appliedBindingRevision?: number;
  readonly resolvedMode?: WaterReflectionPolicyMode;
  readonly bindingApplyCount: number;
  readonly bindingSkipCount: number;
  readonly visible: boolean;
  /** Conservative Camera-frustum demand after the short release debounce. */
  readonly cameraFrustumVisible: boolean;
  /** Consecutive rendered frames in which every Water surface chunk was culled. */
  readonly cameraFrustumCulledFrameCount: number;
  /** Preferred user-selectable authored source. */
  readonly reflectionMode?: WaterReflectionPresentationMode;
  readonly ssrEligible: boolean;
  readonly cameraOwnershipAttached: boolean;
  readonly cameraSurfaceFieldsRequired: boolean;
}

export interface WaterReflectionCameraOwnershipState {
  readonly mode: WaterReflectionMode;
  readonly visible: boolean;
  readonly ssrEligible: boolean;
  readonly surfaceFieldsRequired: boolean;
}

/** Loader-owned Camera lease transaction attached to the backend-owned reflection lifecycle. */
export interface WaterReflectionCameraOwnership {
  setState(state: Readonly<WaterReflectionCameraOwnershipState>): void;
  destroy(): void;
}

/** Read-only runtime reflection state surfaced to DOM-free diagnostics. */
export interface WaterReflectionRuntimeReadback {
  readonly reflectionMode?: WaterReflectionPresentationMode;
}

const CURRENT_LIFECYCLES = new WeakMap<object, Map<string, WaterReflectionBindingLifecycle>>();
const WATER_CAMERA_FRUSTUM_RELEASE_DELAY_FRAMES = 2;

function requireServiceLifecycles(
  service: WaterReflectionBindingService
): Map<string, WaterReflectionBindingLifecycle> {
  let lifecycles = CURRENT_LIFECYCLES.get(service);
  if (!lifecycles) {
    lifecycles = new Map();
    CURRENT_LIFECYCLES.set(service, lifecycles);
  }
  return lifecycles;
}

function normalizeLayerMask(value: number, path: "$.cullingMask" | "$.waterLayerMask", allowZero: boolean): number {
  const normalized = value >>> 0;
  const isSignedOrUnsigned32Bit = Number.isInteger(value) && (value === (value | 0) || value === normalized);
  if (!isSignedOrUnsigned32Bit || (!allowZero && normalized === 0)) {
    throw new Error(
      `Water reflection request '${path}' must be a valid ${allowZero ? "" : "non-zero "}32-bit layer mask.`
    );
  }
  return normalized;
}

function freezeRequest(request: WaterReflectionRequest): WaterReflectionRequest {
  if (request.id.trim().length === 0) {
    throw new Error("Water reflection request id must be non-empty.");
  }
  return Object.freeze({
    ...request,
    policy: normalizeWaterReflectionRequestPolicy(request),
    cullingMask: normalizeLayerMask(request.cullingMask, "$.cullingMask", true),
    waterLayerMask: normalizeLayerMask(request.waterLayerMask, "$.waterLayerMask", false)
  });
}

function reflectionPoliciesEqual(
  left: Readonly<WaterReflectionPolicy>,
  right: Readonly<WaterReflectionPolicy>
): boolean {
  if (left.preferred !== right.preferred || left.fallbacks.length !== right.fallbacks.length) {
    return false;
  }
  for (let index = 0; index < left.fallbacks.length; index++) {
    if (left.fallbacks[index] !== right.fallbacks[index]) return false;
  }
  return true;
}

/**
 * Owns one stable reflection consumer id.
 *
 * Replacement staging remains unpublished until commit. Publishing records a
 * service revision, so cleanup from the superseded same-id runtime cannot
 * remove the replacement request.
 */
export class WaterReflectionBindingLifecycle {
  private readonly _service: WaterReflectionBindingService;
  private readonly _applyBinding: (binding?: Readonly<WaterReflectionBinding>) => void;
  private _request: WaterReflectionRequest;
  private _requestRevision?: number;
  private _published: boolean;
  private _active = true;
  private _cameraOwnership?: WaterReflectionCameraOwnership;
  private _cameraSurfaceFieldsRequired = true;
  private _cameraFrustumVisible = true;
  private _cameraFrustumCulledFrameCount = 0;
  private _bindingApplicationState: "uninitialized" | "cleared" | "bound" = "uninitialized";
  private _appliedBindingRevision?: number;
  private _appliedResolvedMode?: WaterReflectionPolicyMode;
  private _bindingApplyCount = 0;
  private _bindingSkipCount = 0;

  constructor(options: WaterReflectionBindingLifecycleOptions) {
    this._service = options.service;
    this._applyBinding = options.applyBinding;
    this._request = freezeRequest(options.request);
    this._published = options.activationMode !== "replacement-staging";
    if (!this._published) {
      this._applyBindingIfChanged(undefined);
      return;
    }
    this._publishCurrentRequest();
  }

  /**
   * Revision of the reflection binding currently applied to this runtime.
   * @returns The applied revision, or undefined when no binding is applied.
   */
  get appliedBindingRevision(): number | undefined {
    return this._appliedBindingRevision;
  }

  /**
   * Reflection source currently applied to this runtime.
   * @returns The resolved source, or undefined when no binding is applied.
   */
  get resolvedMode(): WaterReflectionPolicyMode | undefined {
    return this._appliedResolvedMode;
  }

  get inspection(): Readonly<WaterReflectionBindingLifecycleInspection> {
    return Object.freeze({
      active: this._active,
      published: this._published,
      currentOwner: this._isCurrentOwner(),
      requestId: this._request.id,
      requestRevision: this._requestRevision,
      appliedBindingRevision: this._appliedBindingRevision,
      resolvedMode: this._appliedResolvedMode,
      bindingApplyCount: this._bindingApplyCount,
      bindingSkipCount: this._bindingSkipCount,
      visible: this._request.visible,
      cameraFrustumVisible: this._cameraFrustumVisible,
      cameraFrustumCulledFrameCount: this._cameraFrustumCulledFrameCount,
      reflectionMode: this.reflectionMode,
      ssrEligible: this.ssrEligible,
      cameraOwnershipAttached: this._cameraOwnership !== undefined,
      cameraSurfaceFieldsRequired: this._cameraSurfaceFieldsRequired
    });
  }

  get reflectionMode(): WaterReflectionPresentationMode | undefined {
    const mode = waterReflectionRequestMode(this._request);
    return mode === "environment" || mode === "ssr" ? mode : undefined;
  }

  get ssrEligible(): boolean {
    return this._request.ssrEligible === true;
  }

  attachCameraOwnership(ownership: WaterReflectionCameraOwnership): void {
    this._assertActive();
    if (this._cameraOwnership === ownership) return;
    if (this._cameraOwnership) {
      throw new Error(`Water reflection binding '${this._request.id}' already owns Camera features.`);
    }
    ownership.setState(this._cameraState(this._request));
    this._cameraOwnership = ownership;
  }

  setVisible(visible: boolean): void {
    this._assertActive();
    if (visible === this._request.visible) return;
    this._replaceRequest({
      ...this._request,
      visible
    });
  }

  /**
   * Observes the current source-Camera frame's Water chunk culling result.
   * Entering the frustum restores Camera ownership immediately. Leaving it must
   * persist for two frames so a boundary crossing cannot flap large Camera RTs.
   */
  observeCameraFrustumVisibility(visible: boolean): void {
    this._assertActive();
    if (visible) {
      const previousCulledFrameCount = this._cameraFrustumCulledFrameCount;
      this._cameraFrustumCulledFrameCount = 0;
      try {
        if (!this._cameraFrustumVisible) this._setCameraFrustumVisible(true);
      } catch (error) {
        this._cameraFrustumCulledFrameCount = previousCulledFrameCount;
        throw error;
      }
      return;
    }
    if (!this._cameraFrustumVisible) return;
    this._cameraFrustumCulledFrameCount++;
    if (this._cameraFrustumCulledFrameCount < WATER_CAMERA_FRUSTUM_RELEASE_DELAY_FRAMES) return;
    try {
      this._setCameraFrustumVisible(false);
    } catch (error) {
      this._cameraFrustumCulledFrameCount = WATER_CAMERA_FRUSTUM_RELEASE_DELAY_FRAMES - 1;
      throw error;
    }
  }

  /**
   * Keeps reflection ownership visible while suppressing Scene Color/Depth leases when only the far closure can run.
   * The transition never republishes the reflection request because environment reflection remains active.
   */
  setCameraSurfaceFieldsRequired(required: boolean): void {
    this._assertActive();
    if (required === this._cameraSurfaceFieldsRequired) return;
    const previous = this._cameraSurfaceFieldsRequired;
    const previousState = this._cameraState(this._request);
    this._cameraSurfaceFieldsRequired = required;
    const nextState = this._cameraState(this._request);
    try {
      this._cameraOwnership?.setState(nextState);
    } catch (error) {
      this._cameraSurfaceFieldsRequired = previous;
      try {
        this._cameraOwnership?.setState(previousState);
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "Water Camera surface-field transition failed and rollback reported an additional error."
        );
      }
      throw error;
    }
  }

  /**
   * Diagnostics-only request injection for reflection arbitration galleries.
   * Production Water bodies receive policy changes only by replacing their
   * shared Water Look through RuntimeHost.
   */
  setReflectionPolicyForDiagnostics(policy: Readonly<WaterReflectionPolicy>): void {
    this._assertActive();
    const nextPolicy = normalizeWaterReflectionRequestPolicy({ policy });
    if (reflectionPoliciesEqual(this._request.policy, nextPolicy)) return;
    this._replaceRequest({ ...this._request, policy: nextPolicy });
  }

  /**
   * Explicit diagnostics hook for labs that exercise arbitration inputs.
   * Production authoring continues to create the initial immutable request.
   */
  setRequestForDiagnostics(request: WaterReflectionRequest): void {
    this._assertActive();
    if (request.id !== this._request.id) {
      throw new Error(`Water reflection diagnostics cannot change stable request id '${this._request.id}'.`);
    }
    this._replaceRequest(request);
  }

  private _replaceRequest(request: WaterReflectionRequest): void {
    const previousRequest = this._request;
    const nextRequest = freezeRequest(request);
    const previousCameraState = this._cameraState(previousRequest);
    const nextCameraState = this._cameraState(nextRequest);
    const cameraTransitionRequired = !this._cameraStatesEqual(previousCameraState, nextCameraState);
    let cameraTransitioned = false;
    let serviceTransitioned = false;
    try {
      if (cameraTransitionRequired) {
        this._cameraOwnership?.setState(nextCameraState);
        cameraTransitioned = this._cameraOwnership !== undefined;
      }
      if (!this._published || !this._isCurrentOwner()) {
        this._request = nextRequest;
        this._applyBindingIfChanged(undefined);
        return;
      }
      const revision = this._service.setRequest(nextRequest);
      serviceTransitioned = true;
      this._request = nextRequest;
      this._requestRevision = revision;
      this.refresh();
    } catch (error) {
      const rollbackErrors: unknown[] = [];
      this._request = previousRequest;
      if (serviceTransitioned) {
        try {
          this._requestRevision = this._service.setRequest(previousRequest);
          this.refresh();
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }
      if (cameraTransitioned) {
        try {
          this._cameraOwnership?.setState(previousCameraState);
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }
      if (rollbackErrors.length > 0) {
        throw new AggregateError(
          [error, ...rollbackErrors],
          "Water reflection request transition failed and rollback reported additional errors."
        );
      }
      throw error;
    }
  }

  commitReplacement(): void {
    this._assertActive();
    if (this._published) return;
    this._publishCurrentRequest();
    this._published = true;
  }

  /** Re-publishes an active superseded lifecycle during transaction revert. */
  restoreReplacement(): void {
    this._assertActive();
    if (!this._published) {
      throw new Error(`Water reflection binding '${this._request.id}' was never published.`);
    }
    if (!this._isCurrentOwner()) this._publishCurrentRequest();
    else this.refresh();
  }

  refresh(): Readonly<WaterReflectionBinding> | undefined {
    this._assertActive();
    const binding =
      this._published && this._isCurrentOwner() && this._request.visible
        ? this._service.getBinding(this._request.id)
        : undefined;
    this._applyBindingIfChanged(binding);
    return binding;
  }

  destroy(): void {
    if (!this._active) return;
    this._active = false;
    const lifecycles = requireServiceLifecycles(this._service);
    const errors: unknown[] = [];
    try {
      if (this._published) {
        this._service.removeRequest(this._request.id, this._requestRevision);
      }
      if (lifecycles.get(this._request.id) === this) {
        lifecycles.delete(this._request.id);
      }
    } catch (error) {
      errors.push(error);
    }
    try {
      this._applyBindingIfChanged(undefined);
    } catch (error) {
      errors.push(error);
    }
    try {
      this._cameraOwnership?.destroy();
      this._cameraOwnership = undefined;
    } catch (error) {
      errors.push(error);
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(errors, "Water reflection binding cleanup reported multiple errors.");
    }
  }

  private _publishCurrentRequest(): void {
    const lifecycles = requireServiceLifecycles(this._service);
    const previous = lifecycles.get(this._request.id);
    let publishedRevision: number | undefined;
    try {
      publishedRevision = this._service.setRequest(this._request);
      this._requestRevision = publishedRevision;
      lifecycles.set(this._request.id, this);
      const binding = this._request.visible ? this._service.getBinding(this._request.id) : undefined;
      this._applyBindingIfChanged(binding);
    } catch (error) {
      const rollbackErrors: unknown[] = [];
      if (publishedRevision !== undefined) {
        try {
          this._service.removeRequest(this._request.id, publishedRevision);
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }
      if (previous?.active) {
        try {
          previous._requestRevision = this._service.setRequest(previous._request);
          lifecycles.set(this._request.id, previous);
          previous.refresh();
        } catch (rollbackError) {
          lifecycles.delete(this._request.id);
          rollbackErrors.push(rollbackError);
        }
      } else {
        lifecycles.delete(this._request.id);
      }
      if (rollbackErrors.length > 0) {
        throw new AggregateError(
          [error, ...rollbackErrors],
          "Water reflection binding publish failed and rollback reported additional errors."
        );
      }
      throw error;
    }
  }

  private get active(): boolean {
    return this._active;
  }

  private _isCurrentOwner(): boolean {
    return requireServiceLifecycles(this._service).get(this._request.id) === this;
  }

  private _applyBindingIfChanged(binding: Readonly<WaterReflectionBinding> | undefined): boolean {
    if (!binding) {
      if (this._bindingApplicationState === "cleared") {
        this._bindingSkipCount++;
        return false;
      }
    } else if (
      this._bindingApplicationState === "bound" &&
      binding.bindingRevision !== undefined &&
      binding.bindingRevision === this._appliedBindingRevision
    ) {
      this._bindingSkipCount++;
      return false;
    }

    this._applyBinding(binding);
    this._bindingApplicationState = binding ? "bound" : "cleared";
    this._appliedBindingRevision = binding?.bindingRevision;
    this._appliedResolvedMode = binding?.resolvedMode;
    this._bindingApplyCount++;
    return true;
  }

  private _cameraState(request: WaterReflectionRequest): Readonly<WaterReflectionCameraOwnershipState> {
    const requestMode = waterReflectionRequestMode(request);
    const mode: WaterReflectionMode =
      requestMode === "analytic" ? "none" : requestMode === "environment" ? "probe" : requestMode;
    return Object.freeze({
      mode,
      visible: request.visible && this._cameraFrustumVisible,
      ssrEligible: request.ssrEligible === true,
      surfaceFieldsRequired: this._cameraSurfaceFieldsRequired
    });
  }

  private _setCameraFrustumVisible(visible: boolean): void {
    if (visible === this._cameraFrustumVisible) return;
    const previousState = this._cameraState(this._request);
    this._cameraFrustumVisible = visible;
    const nextState = this._cameraState(this._request);
    try {
      this._cameraOwnership?.setState(nextState);
    } catch (error) {
      this._cameraFrustumVisible = !visible;
      try {
        this._cameraOwnership?.setState(previousState);
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "Water Camera-frustum transition failed and rollback reported an additional error."
        );
      }
      throw error;
    }
  }

  private _cameraStatesEqual(
    left: Readonly<WaterReflectionCameraOwnershipState>,
    right: Readonly<WaterReflectionCameraOwnershipState>
  ): boolean {
    return (
      left.mode === right.mode &&
      left.visible === right.visible &&
      left.ssrEligible === right.ssrEligible &&
      left.surfaceFieldsRequired === right.surfaceFieldsRequired
    );
  }

  private _assertActive(): void {
    if (!this._active) {
      throw new Error(`Water reflection binding '${this._request.id}' has been destroyed.`);
    }
  }
}
