/** Pure, deterministic reflection-source selection shared by runtime and tests. */
import type { NormalizedWorldPlane } from "./PlanarReflectionMath";

export type WaterReflectionSource = "sky" | "probe" | "planar";
export type WaterReflectionQuality = "low" | "medium" | "high";
export type WaterReflectionFallbackReason =
  | "low-quality"
  | "planar-unavailable"
  | "planar-ineligible"
  | "planar-not-selected"
  | "planar-not-visible"
  | "probe-unavailable"
  | "planar-camera-too-close"
  | "planar-camera-underwater"
  | "planar-plane-back-facing"
  | "planar-orthographic-camera"
  | "planar-invalid-plane"
  | "planar-invalid-projection"
  | "planar-target-failed"
  | "planar-render-failed";

export interface WaterReflectionRequest {
  readonly id: string;
  readonly preferredSource: WaterReflectionSource;
  readonly quality: WaterReflectionQuality;
  readonly visible: boolean;
  readonly priority: number;
  /**
   * Explicit consumer-side eligibility. Omitted legacy requests remain eligible.
   * A non-boolean runtime value fails closed.
   */
  readonly planarEligible?: boolean;
  /** Visible projected area in normalized screen space. Legacy requests default to 0. */
  readonly screenAreaRatio?: number;
  /** Camera-to-surface distance in metres. Legacy requests default to +Infinity. */
  readonly cameraDistanceMeters?: number;
  /** Preferred general representation. The normal must be normalized and its positive side faces the camera. */
  readonly plane?: NormalizedWorldPlane;
  /** Backward-compatible horizontal plane used when `plane` is omitted. */
  readonly planeY?: number;
  /** Optional per-surface override in metres. */
  readonly clipBias?: number;
  /** Debug/validation escape hatch. Defaults to true; production consumers should keep clipping enabled. */
  readonly obliqueClipEnabled?: boolean;
  readonly cullingMask: number;
  readonly waterLayerMask: number;
}

export interface WaterReflectionQualityPolicy {
  readonly planarEnabled: boolean;
  readonly planarResolutionScale: 0 | 0.25 | 0.5;
  readonly planarUpdateIntervalFrames: number;
}

export interface WaterReflectionAvailability {
  readonly probe: boolean;
  readonly planar: boolean;
}

export interface WaterReflectionResolution {
  readonly requestId: string;
  readonly requestedSource: WaterReflectionSource;
  readonly resolvedSource: WaterReflectionSource;
  readonly fallbackReason?: WaterReflectionFallbackReason;
}

export interface WaterReflectionPlan {
  readonly planarOwnerId?: string;
  readonly eligiblePlanarRequestCount: number;
  readonly waterLayerMask: number;
  readonly resolutions: readonly WaterReflectionResolution[];
}

export interface WaterReflectionPlanSelection {
  /** When the selection object is supplied, undefined intentionally means no owner. */
  readonly planarOwnerId?: string;
}

export interface WaterReflectionArbitrationPolicy {
  readonly minimumOwnerHoldFrames: number;
  readonly challengerConfirmFrames: number;
  readonly lostOwnerHandoffFrames: number;
  readonly screenAreaAbsoluteHysteresis: number;
  readonly screenAreaRelativeAdvantage: number;
  readonly cameraDistanceAbsoluteAdvantageMeters: number;
  readonly cameraDistanceRelativeAdvantage: number;
}

export type WaterReflectionPendingReason = "challenger" | "owner-lost";

export interface WaterReflectionArbitrationState {
  readonly selectedOwnerId?: string;
  readonly pendingOwnerId?: string;
  readonly pendingReason?: WaterReflectionPendingReason;
  readonly ownerAgeFrames: number;
  readonly ownerMinimumHoldRemainingFrames: number;
  readonly pendingOwnerAgeFrames: number;
  readonly pendingOwnerConfirmRemainingFrames: number;
  readonly eligiblePlanarRequestCount: number;
}

interface MutableWaterReflectionArbitrationState {
  selectedOwnerId?: string;
  pendingOwnerId?: string;
  pendingReason?: WaterReflectionPendingReason;
  ownerAgeFrames: number;
  ownerMinimumHoldRemainingFrames: number;
  pendingOwnerAgeFrames: number;
  pendingOwnerConfirmRemainingFrames: number;
  eligiblePlanarRequestCount: number;
}

export const WATER_REFLECTION_QUALITY_POLICY: Readonly<Record<WaterReflectionQuality, WaterReflectionQualityPolicy>> =
  Object.freeze({
    low: Object.freeze({
      planarEnabled: false,
      planarResolutionScale: 0,
      planarUpdateIntervalFrames: 0
    }),
    medium: Object.freeze({
      planarEnabled: true,
      planarResolutionScale: 0.25,
      planarUpdateIntervalFrames: 2
    }),
    high: Object.freeze({
      planarEnabled: true,
      planarResolutionScale: 0.5,
      planarUpdateIntervalFrames: 1
    })
  });

/**
 * Frozen P1 stability contract. Area must clear both its absolute and relative
 * guard; inside that band, being either 1 m or 15% closer is enough. This keeps
 * sub-pixel projection noise and camera-distance noise from alternating owners.
 */
export const WATER_REFLECTION_ARBITRATION_POLICY: Readonly<WaterReflectionArbitrationPolicy> = Object.freeze({
  minimumOwnerHoldFrames: 30,
  challengerConfirmFrames: 12,
  lostOwnerHandoffFrames: 6,
  screenAreaAbsoluteHysteresis: 0.02,
  screenAreaRelativeAdvantage: 1.15,
  cameraDistanceAbsoluteAdvantageMeters: 1,
  cameraDistanceRelativeAdvantage: 0.85
});

function compareStableId(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function isPlanarCandidate(request: WaterReflectionRequest): boolean {
  if (
    typeof request.id !== "string" ||
    request.id.length === 0 ||
    request.visible !== true ||
    request.preferredSource !== "planar" ||
    !Number.isFinite(request.priority) ||
    !WATER_REFLECTION_QUALITY_POLICY[request.quality]?.planarEnabled ||
    (request.planarEligible !== undefined && typeof request.planarEligible !== "boolean") ||
    request.planarEligible === false
  ) {
    return false;
  }

  const screenAreaRatio = request.screenAreaRatio ?? 0;
  const cameraDistanceMeters = request.cameraDistanceMeters ?? Number.POSITIVE_INFINITY;
  if (
    !Number.isFinite(screenAreaRatio) ||
    screenAreaRatio < 0 ||
    screenAreaRatio > 1 ||
    (request.cameraDistanceMeters !== undefined && (!Number.isFinite(cameraDistanceMeters) || cameraDistanceMeters < 0))
  ) {
    return false;
  }

  return true;
}

/** Includes legacy defaults while rejecting every explicitly invalid arbitration value. */
export function isWaterReflectionRequestPlanarEligible(request: WaterReflectionRequest): boolean {
  return isPlanarCandidate(request);
}

function comparePlanarCandidates(left: WaterReflectionRequest, right: WaterReflectionRequest): number {
  return (
    right.priority - left.priority ||
    (right.screenAreaRatio ?? 0) - (left.screenAreaRatio ?? 0) ||
    (left.cameraDistanceMeters ?? Number.POSITIVE_INFINITY) -
      (right.cameraDistanceMeters ?? Number.POSITIVE_INFINITY) ||
    compareStableId(left.id, right.id)
  );
}

function collectPlanarCandidates(requests: Iterable<WaterReflectionRequest>): WaterReflectionRequest[] {
  const candidates: WaterReflectionRequest[] = [];
  for (const request of requests) {
    if (isPlanarCandidate(request)) candidates.push(request);
  }
  return candidates.sort(comparePlanarCandidates);
}

function hasScreenAreaAdvantage(
  challenger: WaterReflectionRequest,
  owner: WaterReflectionRequest,
  policy: WaterReflectionArbitrationPolicy
): boolean {
  const challengerArea = challenger.screenAreaRatio ?? 0;
  const ownerArea = owner.screenAreaRatio ?? 0;
  const absoluteAdvantage = challengerArea >= ownerArea + policy.screenAreaAbsoluteHysteresis;
  const relativeAdvantage =
    ownerArea === 0 ? challengerArea > 0 : challengerArea >= ownerArea * policy.screenAreaRelativeAdvantage;
  return absoluteAdvantage && relativeAdvantage;
}

function hasCameraDistanceAdvantage(
  challenger: WaterReflectionRequest,
  owner: WaterReflectionRequest,
  policy: WaterReflectionArbitrationPolicy
): boolean {
  const challengerDistance = challenger.cameraDistanceMeters ?? Number.POSITIVE_INFINITY;
  const ownerDistance = owner.cameraDistanceMeters ?? Number.POSITIVE_INFINITY;
  if (!Number.isFinite(challengerDistance)) return false;
  if (!Number.isFinite(ownerDistance)) return true;
  return (
    challengerDistance <= ownerDistance - policy.cameraDistanceAbsoluteAdvantageMeters ||
    challengerDistance <= ownerDistance * policy.cameraDistanceRelativeAdvantage
  );
}

function isMeaningfullyBetterPlanarCandidate(
  challenger: WaterReflectionRequest,
  owner: WaterReflectionRequest,
  policy: WaterReflectionArbitrationPolicy
): boolean {
  if (challenger.priority !== owner.priority) return challenger.priority > owner.priority;
  if (hasScreenAreaAdvantage(challenger, owner, policy)) return true;
  if (hasScreenAreaAdvantage(owner, challenger, policy)) return false;
  return hasCameraDistanceAdvantage(challenger, owner, policy);
}

/** Stateful owner hysteresis advanced exactly once per service update. */
export class WaterReflectionOwnerArbitrator {
  private _ownerId?: string;
  private _ownerAgeFrames = 0;
  private _pendingOwnerId?: string;
  private _pendingReason?: WaterReflectionPendingReason;
  private _pendingOwnerAgeFrames = 0;
  private readonly _state: MutableWaterReflectionArbitrationState = {
    ownerAgeFrames: 0,
    ownerMinimumHoldRemainingFrames: 0,
    pendingOwnerAgeFrames: 0,
    pendingOwnerConfirmRemainingFrames: 0,
    eligiblePlanarRequestCount: 0
  };
  private _publishedState: Readonly<WaterReflectionArbitrationState> = Object.freeze({ ...this._state });

  constructor(
    private readonly _policy: Readonly<WaterReflectionArbitrationPolicy> = WATER_REFLECTION_ARBITRATION_POLICY
  ) {}

  get state(): Readonly<WaterReflectionArbitrationState> {
    return this._publishedState;
  }

  /** Backward-compatible snapshot API. The returned frozen snapshot is safe to retain. */
  update(
    requests: readonly WaterReflectionRequest[],
    availability: WaterReflectionAvailability
  ): Readonly<WaterReflectionArbitrationState> {
    const state = this._advance(requests, availability);
    this._publishedState = Object.freeze({ ...state });
    return this._publishedState;
  }

  /** Hot-path API. Reuses one mutable backing object; callers must not retain it as a historical snapshot. */
  updateInPlace(
    requests: readonly WaterReflectionRequest[],
    availability: WaterReflectionAvailability
  ): Readonly<WaterReflectionArbitrationState> {
    this._publishedState = this._advance(requests, availability);
    return this._publishedState;
  }

  private _advance(
    requests: readonly WaterReflectionRequest[],
    availability: WaterReflectionAvailability
  ): Readonly<WaterReflectionArbitrationState> {
    let eligiblePlanarRequestCount = 0;
    let bestCandidate: WaterReflectionRequest | undefined;
    let owner: WaterReflectionRequest | undefined;
    for (const request of requests) {
      if (!isPlanarCandidate(request)) continue;
      eligiblePlanarRequestCount++;
      if (!availability.planar) continue;
      if (!bestCandidate || comparePlanarCandidates(request, bestCandidate) < 0) bestCandidate = request;
      if (request.id === this._ownerId) owner = request;
    }

    if (!this._ownerId) {
      if (bestCandidate) this._commitOwner(bestCandidate.id);
      else this._clearPending();
      return this._publishState(bestCandidate?.id, eligiblePlanarRequestCount);
    }

    if (!owner) {
      if (!bestCandidate) {
        this._clearPending();
        return this._publishState(undefined, eligiblePlanarRequestCount);
      }
      this._advancePending(bestCandidate.id, "owner-lost");
      if (this._pendingOwnerAgeFrames >= this._policy.lostOwnerHandoffFrames) {
        this._commitOwner(bestCandidate.id);
        return this._publishState(bestCandidate.id, eligiblePlanarRequestCount);
      }
      return this._publishState(undefined, eligiblePlanarRequestCount);
    }

    this._ownerAgeFrames++;
    let challenger: WaterReflectionRequest | undefined;
    for (const request of requests) {
      if (
        !availability.planar ||
        request.id === owner.id ||
        !isPlanarCandidate(request) ||
        !isMeaningfullyBetterPlanarCandidate(request, owner, this._policy)
      ) {
        continue;
      }
      if (!challenger || comparePlanarCandidates(request, challenger) < 0) challenger = request;
    }
    if (!challenger) {
      this._clearPending();
      return this._publishState(owner.id, eligiblePlanarRequestCount);
    }

    this._advancePending(challenger.id, "challenger");
    if (
      this._ownerAgeFrames >= this._policy.minimumOwnerHoldFrames &&
      this._pendingOwnerAgeFrames >= this._policy.challengerConfirmFrames
    ) {
      this._commitOwner(challenger.id);
      return this._publishState(challenger.id, eligiblePlanarRequestCount);
    }
    return this._publishState(owner.id, eligiblePlanarRequestCount);
  }

  reset(): void {
    this._ownerId = undefined;
    this._ownerAgeFrames = 0;
    this._clearPending();
    const state = this._publishState(undefined, 0);
    this._publishedState = Object.freeze({ ...state });
  }

  private _advancePending(ownerId: string, reason: WaterReflectionPendingReason): void {
    if (this._pendingOwnerId === ownerId && this._pendingReason === reason) {
      this._pendingOwnerAgeFrames++;
      return;
    }
    this._pendingOwnerId = ownerId;
    this._pendingReason = reason;
    this._pendingOwnerAgeFrames = 1;
  }

  private _commitOwner(ownerId: string): void {
    this._ownerId = ownerId;
    this._ownerAgeFrames = 0;
    this._clearPending();
  }

  private _clearPending(): void {
    this._pendingOwnerId = undefined;
    this._pendingReason = undefined;
    this._pendingOwnerAgeFrames = 0;
  }

  private _publishState(
    selectedOwnerId: string | undefined,
    eligiblePlanarRequestCount: number
  ): WaterReflectionArbitrationState {
    const pendingConfirmFrames =
      this._pendingReason === "owner-lost" ? this._policy.lostOwnerHandoffFrames : this._policy.challengerConfirmFrames;
    this._state.selectedOwnerId = selectedOwnerId;
    this._state.pendingOwnerId = this._pendingOwnerId;
    this._state.pendingReason = this._pendingReason;
    this._state.ownerAgeFrames = selectedOwnerId ? this._ownerAgeFrames : 0;
    this._state.ownerMinimumHoldRemainingFrames = selectedOwnerId
      ? Math.max(0, this._policy.minimumOwnerHoldFrames - this._ownerAgeFrames)
      : 0;
    this._state.pendingOwnerAgeFrames = this._pendingOwnerAgeFrames;
    this._state.pendingOwnerConfirmRemainingFrames = this._pendingOwnerId
      ? Math.max(0, pendingConfirmFrames - this._pendingOwnerAgeFrames)
      : 0;
    this._state.eligiblePlanarRequestCount = eligiblePlanarRequestCount;
    return this._state;
  }
}

function fallbackToProbeOrSky(
  request: WaterReflectionRequest,
  availability: WaterReflectionAvailability,
  fallbackReason: WaterReflectionResolution["fallbackReason"]
): WaterReflectionResolution {
  if (availability.probe) {
    return Object.freeze({
      requestId: request.id,
      requestedSource: request.preferredSource,
      resolvedSource: "probe",
      fallbackReason
    });
  }
  return Object.freeze({
    requestId: request.id,
    requestedSource: request.preferredSource,
    resolvedSource: "sky",
    fallbackReason
  });
}

/**
 * Selects at most one planar owner. Candidates are gated by eligibility, then
 * ranked by priority, projected area, camera distance, and stable id.
 * Low-quality requests can ask for planar but always resolve through probe/sky.
 */
export function resolveWaterReflectionPlan(
  requests: readonly WaterReflectionRequest[],
  availability: WaterReflectionAvailability,
  selection?: WaterReflectionPlanSelection
): WaterReflectionPlan {
  // The shared reflection camera must never render a registered water layer.
  // A consumer can be temporarily invisible while another surface owns the
  // planar target, so limiting this mask to visible requests can reintroduce a
  // recursive water draw when its renderer is still active for one frame.
  const waterLayerMask = requests.reduce((mask, request) => mask | request.waterLayerMask, 0);
  const visible = requests.filter((request) => request.visible === true);
  const planarCandidates = collectPlanarCandidates(visible);
  const planarOwnerId = availability.planar
    ? selection === undefined
      ? planarCandidates[0]?.id
      : planarCandidates.find((candidate) => candidate.id === selection.planarOwnerId)?.id
    : undefined;
  const resolutions: WaterReflectionResolution[] = [];

  for (const request of visible) {
    if (request.preferredSource === "sky") {
      resolutions.push(Object.freeze({ requestId: request.id, requestedSource: "sky", resolvedSource: "sky" }));
      continue;
    }
    if (request.preferredSource === "probe") {
      resolutions.push(
        availability.probe
          ? Object.freeze({ requestId: request.id, requestedSource: "probe", resolvedSource: "probe" })
          : fallbackToProbeOrSky(request, availability, "probe-unavailable")
      );
      continue;
    }

    const qualityPolicy = WATER_REFLECTION_QUALITY_POLICY[request.quality];
    const eligible = isPlanarCandidate(request);
    if (!qualityPolicy?.planarEnabled) {
      resolutions.push(fallbackToProbeOrSky(request, availability, "low-quality"));
    } else if (!availability.planar) {
      resolutions.push(fallbackToProbeOrSky(request, availability, "planar-unavailable"));
    } else if (!eligible) {
      resolutions.push(fallbackToProbeOrSky(request, availability, "planar-ineligible"));
    } else if (request.id !== planarOwnerId) {
      resolutions.push(fallbackToProbeOrSky(request, availability, "planar-not-selected"));
    } else {
      resolutions.push(Object.freeze({ requestId: request.id, requestedSource: "planar", resolvedSource: "planar" }));
    }
  }

  return Object.freeze({
    planarOwnerId,
    eligiblePlanarRequestCount: planarCandidates.length,
    waterLayerMask,
    resolutions: Object.freeze(resolutions)
  });
}
