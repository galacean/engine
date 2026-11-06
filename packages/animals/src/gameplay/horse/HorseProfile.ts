import { scaleAnimalProfile } from "../animal/AnimalSpeciesAsset";

/** Calibrated asset aliases and gameplay settings; all distances are metres and times are engine seconds. */
export const HORSE_PROFILE = {
  modelScale: 0.1,
  mountable: true,
  rootMotion: { bone: "BN_Root_01_01", horizontalAxes: ["x", "y"] },
  // Actual skinned vertices over 4,467 poses, with 10% padding; see analyze_horse_bounds.py.
  skinnedBounds: { min: [-212, -226, -115], max: [171, 288, 379] },
  saddleBone: "BN_Spine_01_03_03",
  saddleLocal: [-0.89943252, 14.46593192, -22.92381184],
  modelGroundOffset: 0.01,
  spawnDistance: 9,
  skyHeight: 3.2,
  dropSeconds: 1,
  fallingSeconds: 1,
  skySideAngle: -Math.PI / 12,
  skyFacingOffset: Math.PI / 2,
  fadeSeconds: 0.18,
  vanishSeconds: 2,
  walkSpeed: 1.4,
  // Approximate calibrated stance speed from low-height hoof samples of Walk and its L/R clips.
  walkClipSpeed: 1.03,
  gallopSpeed: 6.5,
  turnSpeed: 2.8,
  rideMaxTurnRate: 1.1,
  viewFollowGain: 2.5,
  turnTolerance: 0.04,
  turnStepSpeed: 0.7,
  turnStepRadius: 0.65,
  arrivalDistance: 1.9,
  mountRadius: 2.35,
  mountExitRadius: 2.9,
  mountCooldown: 1.8,
  dismountDistance: 3.3,
  clips: {
    idle: "Skeleton|1 Ilde",
    idleB: "Skeleton|2 Ilde",
    idleC: "Skeleton|3 Ilde",
    eat: "Skeleton|6 Eat",
    falling: "Skeleton|Falling",
    launch: "Skeleton|Buck_2",
    walk: "Skeleton|Walk",
    run: "Skeleton|Gallop",
    walkLeft: "Skeleton|Walk_L",
    walkRight: "Skeleton|Walk_R",
    runLeft: "Skeleton|Gallop_L",
    runRight: "Skeleton|Gallop_R",
    stop: "Skeleton|Run_Stop",
    turn: "Skeleton|Walk_L",
    death: "Skeleton|Death"
  }
} as const;

/** Names in the native Animator state graph. */
export type HorseState = keyof typeof HORSE_PROFILE.clips;

/** Automatic native transitions, completed only after their source clip's exit time. */
export const HORSE_NEXT: Partial<Record<HorseState, HorseState>> = {};

/** Return the signed shortest rotation between two yaw angles, in radians. */
export function horseAngleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/**
 * Adapts one mount to a host world's presentation scale without scaling its scene parent.
 * @param scale Positive multiplier relative to the calibrated metre-sized horse.
 * @returns Independent dimensions and locomotion calibration; animation timing stays unchanged.
 * @throws RangeError if scale is not finite and positive.
 */
export function createHorseProfile(scale = 1) {
  return scaleAnimalProfile(HORSE_PROFILE, scale);
}
