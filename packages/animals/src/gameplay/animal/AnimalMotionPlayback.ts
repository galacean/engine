import type { GroundAnimalMotion } from "./GroundAnimalSteering";

const MIN_DISTANCE_CADENCE_RATIO = 0.35;
const MAX_DISTANCE_CADENCE_RATIO = 1.45;
const CADENCE_SMOOTHING_HZ = 14;

/** Combine 3D surface translation speed with a physically bounded foot-pivot turning term. */
export function groundAnimalEffectiveSpeed(
  speed: number,
  angularSpeed: number,
  bodyLength: number,
  nominalSpeed: number,
  slopeScale = 1
): number {
  const forward = Math.max(0, speed) * Math.max(1, slopeScale);
  // Outer feet sit ~0.15 body-lengths off the turning axis; cap the pivot term so tight
  // turns step smoothly rather than pumping forward-gait legs at 3x displacement speed.
  const turnLimit = nominalSpeed > 0 ? nominalSpeed * 0.45 : Infinity;
  const turn = Math.min(turnLimit, Math.abs(angularSpeed) * bodyLength * 0.15);
  return Math.hypot(forward, turn);
}

/**
 * One-shot animation clock coupled to ground motion. The behavior tree alone chooses clips.
 * A resting, completed or not-yet-evaluated pose cannot authorize root translation or rotation.
 */
export class AnimalMotionPlayback {
  elapsed = 0;
  duration = 0;
  rate = 1;
  private nominalSpeed = 0;
  private stepSeconds = 0;
  private cadence: "distance" | "time" = "distance";
  private baseRate = 1;
  private rateInitialized = false;

  /** Start the tree-selected clip. A positive speed explicitly marks a locomotion pose. */
  start(duration: number, nominalSpeed = 0, cadence: "distance" | "time" = "distance", baseRate = 1): void {
    const wasDistanceLocomotion = this.cadence === "distance" && this.nominalSpeed > 0;
    this.duration = duration;
    this.cadence = cadence;
    this.baseRate = baseRate;
    this.nominalSpeed = nominalSpeed / baseRate;
    this.elapsed = this.stepSeconds = 0;
    if (cadence === "distance" && this.nominalSpeed > 0) {
      const minRate = baseRate * MIN_DISTANCE_CADENCE_RATIO;
      const maxRate = baseRate * MAX_DISTANCE_CADENCE_RATIO;
      // Preserve ongoing stride cadence across clip boundaries instead of spiking to 1.0x for one frame.
      this.rate = wasDistanceLocomotion ? Math.max(minRate, Math.min(maxRate, this.rate)) : minRate;
      this.rateInitialized = wasDistanceLocomotion;
    } else {
      this.rate = baseRate;
      this.rateInitialized = true;
    }
  }

  /** Update speed and cadence without resetting the current clip phase.
   * @param speed Requested calibrated locomotion speed.
   * @param baseRate Authored cadence after the current intent's pace adjustment.
   */
  setSpeed(speed: number, baseRate = this.baseRate): void {
    this.baseRate = baseRate;
    this.nominalSpeed = speed / this.baseRate;
  }

  /**
   * Prepare both clocks from a proposed post-contact movement.
   * Returns the fraction of root motion supported by this step's advancing locomotion pose.
   * ready=false covers an engine frame in which play/crossFade intentionally evaluates only time zero.
   */
  prepare(
    seconds: number,
    proposed: Readonly<GroundAnimalMotion>,
    bodyLength: number,
    ready = true,
    slopeScale = 1
  ): number {
    this.stepSeconds = 0;
    if (!ready || this.elapsed >= this.duration) return 0;
    const locomotion = this.nominalSpeed > 0;
    if (this.cadence === "distance" && locomotion) {
      const effectiveSpeed = groundAnimalEffectiveSpeed(
        proposed.speed,
        proposed.angularSpeed,
        bodyLength,
        this.nominalSpeed * this.baseRate,
        slopeScale
      );
      const minRate = this.baseRate * MIN_DISTANCE_CADENCE_RATIO;
      const maxRate = this.baseRate * MAX_DISTANCE_CADENCE_RATIO;
      // Keep a bounded, continuous cadence floor even at zero speed so braking and blocked
      // frames never jump discontinuously to 1.0x or freeze an airborne gait pose.
      const targetRate =
        effectiveSpeed > 1e-6 ? Math.max(minRate, Math.min(maxRate, effectiveSpeed / this.nominalSpeed)) : minRate;
      if (!this.rateInitialized) {
        this.rate = targetRate;
        this.rateInitialized = true;
      } else {
        const alpha = 1 - Math.exp(-CADENCE_SMOOTHING_HZ * Math.max(0, seconds));
        this.rate += (targetRate - this.rate) * alpha;
      }
    } else {
      this.rate = this.baseRate;
      this.rateInitialized = true;
    }
    const remaining = this.duration - this.elapsed;
    const requested = seconds * this.rate;
    // GLB key times are float32. Do not turn their rounding tail into a near-zero
    // extra motion step that brakes the animal at every authored gait boundary.
    this.stepSeconds = remaining <= requested + 1e-7 ? remaining : requested;
    if (!locomotion) return 0;
    // Crossfade weights mix poses, not physical velocity. Multiplying velocity by that
    // weight every step repeatedly brakes short/replayed gaits. Steering already ramps
    // acceleration; the native advancing-pose receipt remains the motion permission.
    return Math.min(1, this.stepSeconds / requested);
  }

  /** Consume exactly the prepared animation interval, once per shared motion step. */
  advance(): number {
    const seconds = this.stepSeconds;
    this.elapsed = Math.min(this.duration, this.elapsed + seconds);
    this.stepSeconds = 0;
    return seconds;
  }
}
