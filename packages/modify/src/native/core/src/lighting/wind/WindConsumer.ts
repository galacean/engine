import type {
  WindConsumerAdapter,
  WindConsumerFrameContext,
  WindLodPolicy,
  WindLodTier,
  WindResponseProfile,
  WindSample,
  WindVector3Tuple
} from "./WindTypes";

const WIND_LOD_TIERS: readonly WindLodTier[] = ["hero", "near", "mid", "far", "off"];
const MAX_INTEGRATION_DELTA_SECONDS = 0.1;
const INTEGRATION_STEP_SECONDS = 1 / 120;
const MIN_VECTOR_LENGTH = 1e-6;
const VALIDATED_LOD_POLICIES = new WeakSet<object>();

/** Mutable allocation-safe result of one Wind LOD lookup. */
export interface WindLodSelection {
  tier: WindLodTier;
  tierIndex: number;
  /** Zero inside a band and one at its transition into the next band. */
  transition: number;
  primaryMotion: number;
  secondaryMotion: number;
  microMotion: number;
  localField: number;
  statefulResponse: number;
}

/** Explicit second-order state retained only by consumers and LODs that need inertia. */
export interface WindSecondOrderState {
  targetWS: WindVector3Tuple;
  responseWS: WindVector3Tuple;
  responseVelocityWS: WindVector3Tuple;
}

/** Allocation-safe output of {@link WindSecondOrderAdapter}. */
export interface WindSecondOrderOutput {
  targetWS: WindVector3Tuple;
  responseWS: WindVector3Tuple;
  responseVelocityWS: WindVector3Tuple;
  lod: WindLodSelection;
}

/** Creates the detached default output required by the allocation-safe LOD resolver. */
export function createWindLodSelection(): WindLodSelection {
  return {
    tier: "off",
    tierIndex: WIND_LOD_TIERS.length - 1,
    transition: 0,
    primaryMotion: 0,
    secondaryMotion: 0,
    microMotion: 0,
    localField: 0,
    statefulResponse: 0
  };
}

/**
 * Resolves a continuous perceptual Wind LOD without coupling it to render-mesh LOD.
 *
 * @remarks
 * Bands own explicit feature weights. The final transition fades to `off`, so distant receivers
 * never pop even when their render geometry remains visible.
 */
export function resolveWindLod(
  distanceToCameraMeters: number,
  policy: Readonly<WindLodPolicy>,
  out: WindLodSelection = createWindLodSelection()
): WindLodSelection {
  validateWindLodPolicy(policy);
  if (!Number.isFinite(distanceToCameraMeters) || distanceToCameraMeters < 0) {
    throw new RangeError("Wind consumer distance must be finite and non-negative");
  }
  const bands = policy.bands;
  let bandIndex = bands.length;
  for (let index = 0; index < bands.length; index++) {
    if (distanceToCameraMeters <= bands[index].maximumDistanceMeters) {
      bandIndex = index;
      break;
    }
  }
  if (bandIndex === bands.length) {
    resetWindLodSelection(out);
    return out;
  }

  const band = bands[bandIndex];
  const next = bands[bandIndex + 1];
  const transitionWidth = Math.min(
    policy.transitionMeters,
    band.maximumDistanceMeters - (bandIndex > 0 ? bands[bandIndex - 1].maximumDistanceMeters : 0)
  );
  const transitionStart = band.maximumDistanceMeters - transitionWidth;
  const transition =
    transitionWidth > 0 ? smoothstep01((distanceToCameraMeters - transitionStart) / transitionWidth) : 0;
  out.tier = band.tier;
  out.tierIndex = WIND_LOD_TIERS.indexOf(band.tier);
  out.transition = transition;
  out.primaryMotion = lerp(band.primaryMotion, next?.primaryMotion ?? 0, transition);
  out.secondaryMotion = lerp(band.secondaryMotion, next?.secondaryMotion ?? 0, transition);
  out.microMotion = lerp(band.microMotion, next?.microMotion ?? 0, transition);
  out.localField = lerp(band.localField, next?.localField ?? 0, transition);
  out.statefulResponse = lerp(band.statefulResponse, next?.statefulResponse ?? 0, transition);
  return out;
}

/** Validates an authored response profile at load time rather than failing inside a render loop. */
export function validateWindResponseProfile(profile: Readonly<WindResponseProfile>): void {
  if (!profile || typeof profile !== "object") throw new TypeError("Wind response profile is required");
  if (typeof profile.id !== "string" || !profile.id.trim()) {
    throw new RangeError("Wind response profile id must not be empty");
  }
  validatePositive("referenceSpeedMps", profile.referenceSpeedMps);
  validateNonNegative("meanGain", profile.meanGain);
  validateNonNegative("gustGain", profile.gustGain);
  validateNonNegative("turbulenceGain", profile.turbulenceGain);
  validateNonNegative("localGain", profile.localGain);
  validatePositive("naturalFrequencyHz", profile.naturalFrequencyHz);
  validateNonNegative("dampingRatio", profile.dampingRatio);
  if (profile.targetSmoothingSeconds !== undefined) {
    validatePositive("targetSmoothingSeconds", profile.targetSmoothingSeconds);
  }
  validatePositive("maximumResponse", profile.maximumResponse);
  validateWindLodPolicy(profile.lodPolicy);
}

/** Validates strictly ordered bands and normalized feature weights. */
export function validateWindLodPolicy(policy: Readonly<WindLodPolicy>): void {
  if (!policy || typeof policy !== "object") throw new TypeError("Wind LOD policy is required");
  if (VALIDATED_LOD_POLICIES.has(policy)) return;
  validateNonNegative("LOD transitionMeters", policy.transitionMeters);
  if (!Array.isArray(policy.bands) || policy.bands.length === 0) {
    throw new RangeError("Wind LOD policy must contain at least one band");
  }
  let previousDistance = 0;
  for (let index = 0; index < policy.bands.length; index++) {
    const band = policy.bands[index];
    if (band.tier === "off" || !WIND_LOD_TIERS.includes(band.tier)) {
      throw new RangeError(`Wind LOD band ${index} must use a visible tier`);
    }
    validatePositive(`LOD band ${index} maximumDistanceMeters`, band.maximumDistanceMeters);
    if (band.maximumDistanceMeters <= previousDistance) {
      throw new RangeError("Wind LOD band distances must be strictly increasing");
    }
    previousDistance = band.maximumDistanceMeters;
    for (const field of [
      "primaryMotion",
      "secondaryMotion",
      "microMotion",
      "localField",
      "statefulResponse"
    ] as const) {
      const value = band[field];
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new RangeError(`Wind LOD band ${index} ${field} must be within 0..1`);
      }
    }
  }
  // Policies are authored immutable data. Cache successful validation so a receiver may resolve
  // Wind LOD in a hot loop without walking the same bands for every instance and every frame.
  VALIDATED_LOD_POLICIES.add(policy);
}

/**
 * Reference adapter for receivers that need inertial opposition to changing air load.
 * Concrete consumers choose a profile; placed instances only own the two response vectors.
 */
export class WindSecondOrderAdapter<TProfile extends WindResponseProfile = WindResponseProfile>
  implements WindConsumerAdapter<TProfile, WindSecondOrderState, WindSecondOrderOutput>
{
  readonly profile: TProfile;

  constructor(profile: TProfile) {
    validateWindResponseProfile(profile);
    this.profile = profile;
  }

  createState(): WindSecondOrderState {
    return { targetWS: [0, 0, 0], responseWS: [0, 0, 0], responseVelocityWS: [0, 0, 0] };
  }

  createOutput(): WindSecondOrderOutput {
    return {
      targetWS: [0, 0, 0],
      responseWS: [0, 0, 0],
      responseVelocityWS: [0, 0, 0],
      lod: createWindLodSelection()
    };
  }

  update(
    sample: Readonly<WindSample>,
    frame: Readonly<WindConsumerFrameContext>,
    state: WindSecondOrderState,
    out: WindSecondOrderOutput
  ): WindSecondOrderOutput {
    if (!Number.isFinite(frame.deltaTimeSeconds) || frame.deltaTimeSeconds < 0) {
      throw new RangeError("Wind consumer delta time must be finite and non-negative");
    }
    const profile = this.profile;
    const lod = resolveWindLod(frame.distanceToCameraMeters, profile.lodPolicy, out.lod);
    const target = out.targetWS;
    for (let axis = 0; axis < 3; axis++) {
      const unresolved =
        sample.velocityWS[axis] -
        sample.meanVelocityWS[axis] -
        sample.gustVelocityWS[axis] -
        sample.localVelocityWS[axis];
      target[axis] =
        ((sample.meanVelocityWS[axis] * profile.meanGain +
          sample.gustVelocityWS[axis] * profile.gustGain +
          unresolved * profile.turbulenceGain +
          sample.localVelocityWS[axis] * profile.localGain) /
          profile.referenceSpeedMps) *
        lod.primaryMotion;
    }
    clampVectorLength(target, profile.maximumResponse);

    // The far-tier fast path is intentionally stateless. Snapping the dormant state to the
    // current target also gives a continuous starting point if the receiver later re-enters a
    // stateful band.
    if (lod.statefulResponse <= 0) {
      copyTuple(target, state.targetWS);
      copyTuple(target, state.responseWS);
      resetTuple(state.responseVelocityWS);
      copyTuple(target, out.responseWS);
      resetTuple(out.responseVelocityWS);
      return out;
    }

    const clampedDelta = Math.min(frame.deltaTimeSeconds, MAX_INTEGRATION_DELTA_SECONDS);
    const targetSmoothingSeconds = profile.targetSmoothingSeconds ?? 0;
    if (targetSmoothingSeconds > 0) {
      const targetBlend = 1 - Math.exp(-clampedDelta / targetSmoothingSeconds);
      for (let axis = 0; axis < 3; axis++) {
        state.targetWS[axis] = lerp(state.targetWS[axis], target[axis], targetBlend);
        target[axis] = state.targetWS[axis];
      }
    } else {
      copyTuple(target, state.targetWS);
    }
    const substeps = Math.max(1, Math.ceil(clampedDelta / INTEGRATION_STEP_SECONDS));
    const step = clampedDelta / substeps;
    const angularFrequency = Math.PI * 2 * profile.naturalFrequencyHz;
    const stiffness = angularFrequency * angularFrequency;
    const damping = 2 * profile.dampingRatio * angularFrequency;
    for (let substep = 0; substep < substeps; substep++) {
      for (let axis = 0; axis < 3; axis++) {
        const acceleration =
          stiffness * (target[axis] - state.responseWS[axis]) - damping * state.responseVelocityWS[axis];
        state.responseVelocityWS[axis] += acceleration * step;
        state.responseWS[axis] += state.responseVelocityWS[axis] * step;
      }
      constrainVectorLength(state.responseWS, state.responseVelocityWS, profile.maximumResponse);
    }
    for (let axis = 0; axis < 3; axis++) {
      out.responseWS[axis] = lerp(target[axis], state.responseWS[axis], lod.statefulResponse);
      out.responseVelocityWS[axis] = state.responseVelocityWS[axis] * lod.statefulResponse;
    }
    return out;
  }
}

function resetWindLodSelection(out: WindLodSelection): void {
  out.tier = "off";
  out.tierIndex = WIND_LOD_TIERS.length - 1;
  out.transition = 0;
  out.primaryMotion = 0;
  out.secondaryMotion = 0;
  out.microMotion = 0;
  out.localField = 0;
  out.statefulResponse = 0;
}

function clampVectorLength(value: WindVector3Tuple, maximum: number): void {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length <= maximum || length <= MIN_VECTOR_LENGTH) return;
  const scale = maximum / length;
  value[0] *= scale;
  value[1] *= scale;
  value[2] *= scale;
}

/**
 * Enforces the radial response limit without retaining velocity that points through it.
 * Tangential velocity and inward recovery are physical and remain untouched.
 */
function constrainVectorLength(value: WindVector3Tuple, velocity: WindVector3Tuple, maximum: number): void {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length <= maximum || length <= MIN_VECTOR_LENGTH) return;
  const normalX = value[0] / length;
  const normalY = value[1] / length;
  const normalZ = value[2] / length;
  value[0] = normalX * maximum;
  value[1] = normalY * maximum;
  value[2] = normalZ * maximum;
  const outwardVelocity = velocity[0] * normalX + velocity[1] * normalY + velocity[2] * normalZ;
  if (outwardVelocity <= 0) return;
  velocity[0] -= normalX * outwardVelocity;
  velocity[1] -= normalY * outwardVelocity;
  velocity[2] -= normalZ * outwardVelocity;
}

function copyTuple(source: readonly number[], target: WindVector3Tuple): void {
  target[0] = source[0];
  target[1] = source[1];
  target[2] = source[2];
}

function resetTuple(target: WindVector3Tuple): void {
  target[0] = 0;
  target[1] = 0;
  target[2] = 0;
}

function validatePositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`Wind ${name} must be finite and positive`);
}

function validateNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`Wind ${name} must be finite and non-negative`);
}

function lerp(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

function smoothstep01(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
}
