import type { GroundAnimalMotion } from "./GroundAnimalSteering";

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

  /** Start the tree-selected clip. A positive speed explicitly marks a locomotion pose. */
  start(duration: number, nominalSpeed = 0, cadence: "distance" | "time" = "distance", baseRate = 1): void {
    this.duration = duration;
    this.cadence = cadence;
    this.baseRate = baseRate;
    this.nominalSpeed = nominalSpeed / baseRate;
    this.elapsed = this.stepSeconds = 0;
    this.rate = baseRate;
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
   * Prepare both clocks from a proposed movement, before collision constraints are committed.
   * Returns the fraction of root motion supported by this step's advancing locomotion pose.
   * ready=false covers an engine frame in which play/crossFade intentionally evaluates only time zero.
   */
  prepare(seconds: number, proposed: Readonly<GroundAnimalMotion>, bodyLength: number, ready = true): number {
    this.stepSeconds = 0;
    if (!ready || this.elapsed >= this.duration) return 0;
    const locomotion = this.nominalSpeed > 0;
    const groundSpeed = Math.hypot(proposed.speed, proposed.angularSpeed * bodyLength * 0.35);
    // Acceleration, avoidance and turning change stride cadence even during a native crossfade.
    // Keep the pose clock live at zero speed; the tree replaces blocked movement
    // with idle on the solver event, rather than freezing an airborne gait pose.
    this.rate =
      this.cadence === "distance" && locomotion && groundSpeed > 1e-8 ? groundSpeed / this.nominalSpeed : this.baseRate;
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
