/** Mutable metre-space motion state; heading and angular speed use radians. */
export interface GroundAnimalMotion {
  x: number;
  z: number;
  heading: number;
  speed: number;
  angularSpeed: number;
}

/** Optional medium-specific steering; omitted values preserve terrestrial gait behavior. */
export interface AnimalSteeringOptions {
  maxAngularSpeed: number;
  /** Fraction of cruise speed retained through an open turn; traffic and terminal braking still take precedence. */
  turnSpeedRatio: number;
  /** Supported landing tolerance in metres; flight stops in place instead of snapping to the centre. */
  arrivalRadius?: number;
  /** Airborne continuation cannot brake to a stop at a temporary steering target. */
  continuous?: boolean;
  /** Respond to a threat with a short acceleration ramp while retaining support and traffic limits. */
  urgent?: boolean;
}

/**
 * Advance forward ground travel along a smooth arc, with bounded angular acceleration.
 * Turn radius follows body length and speed; a target change never snaps the actor or slides it sideways.
 * @param motion Reused state, updated in place without per-frame allocation.
 * @param target Destination in metres.
 * @param speed Nominal movement speed after instance scaling.
 * @param bodyLength Ground-plane body length after instance scaling.
 * @param seconds Positive simulation step.
 * @param speedLimit Local avoidance speed cap; acceleration and braking remain bounded.
 * @param steering Turning, arrival and threat-response policy for this movement.
 * @returns True when the actor reaches the destination.
 */
export function advanceGroundAnimalMotion(
  motion: GroundAnimalMotion,
  target: readonly [number, number],
  speed: number,
  bodyLength: number,
  seconds: number,
  speedLimit = speed,
  steering?: Readonly<AnimalSteeringOptions>
): boolean {
  const dx = target[0] - motion.x,
    dz = target[1] - motion.z;
  const distance = Math.hypot(dx, dz);
  const arrivalRadius = steering?.arrivalRadius ?? groundAnimalArrivalRadius(bodyLength);
  if (!steering?.continuous && distance < arrivalRadius) {
    motion.speed = motion.angularSpeed = 0;
    return true;
  }
  const desired = Math.atan2(dx, dz);
  const error = Math.atan2(Math.sin(desired - motion.heading), Math.cos(desired - motion.heading));
  // Body length sets curvature; the absolute cap and ramp prevent small/fast gaits from whipping around.
  const nominalAngularSpeed = Math.min(steering?.maxAngularSpeed ?? 0.3, speed / Math.max(0.1, bodyLength * 1.25));
  const angularAcceleration = nominalAngularSpeed / (steering?.urgent ? 0.15 : 1);
  const turnRadius = Math.max(0.1, bodyLength * 0.75);
  const alignment = Math.max(0, 1 - Math.abs(error) / (Math.PI / 6));
  const acceleration = Math.max(0.05, speed / (steering?.urgent ? 0.15 : 0.6));
  // Ordinary turns brake to a body-sized stepping arc; escape steering combines
  // a higher yaw limit with a faster moving arc. Neither translates sideways.
  const turningSpeed = Math.min(
    speed,
    Math.max(speed * (steering?.turnSpeedRatio ?? 0), nominalAngularSpeed * turnRadius)
  );
  const desiredSpeed = Math.min(
    speedLimit,
    turningSpeed + (speed - turningSpeed) * alignment * alignment,
    // Near lateral/rear goals, the turning circle must fit inside the remaining distance.
    !steering?.continuous && Math.abs(error) > 0.15
      ? (nominalAngularSpeed * distance * 0.6) / Math.max(0.15, Math.abs(Math.sin(error)))
      : speed,
    steering?.continuous ? speed : Math.sqrt(2 * acceleration * Math.max(0, distance - arrivalRadius)),
    steering?.continuous ? speed : distance / Math.max(seconds, 1e-6)
  );
  motion.speed += Math.max(-acceleration * seconds, Math.min(acceleration * seconds, desiredSpeed - motion.speed));
  // Resolve travel first: using the previous zero speed here would prevent rear-goal starts.
  const step = steering?.continuous ? motion.speed * seconds : Math.min(distance, motion.speed * seconds);
  const maxAngularSpeed = Math.min(nominalAngularSpeed, step / (turnRadius * seconds));
  const desiredAngularSpeed =
    Math.sign(error) * Math.min(maxAngularSpeed, Math.sqrt(2 * angularAcceleration * Math.abs(error)));
  motion.angularSpeed += Math.max(
    -angularAcceleration * seconds,
    Math.min(angularAcceleration * seconds, desiredAngularSpeed - motion.angularSpeed)
  );
  motion.angularSpeed = Math.max(-maxAngularSpeed, Math.min(maxAngularSpeed, motion.angularSpeed));
  const turn = motion.angularSpeed * seconds;
  if (Math.sign(turn) === Math.sign(error) && Math.abs(turn) >= Math.abs(error)) {
    // Retain continuous headings across atan2's wrap boundary.
    motion.heading += error;
    motion.angularSpeed = 0;
  } else motion.heading += turn;
  motion.x += Math.sin(motion.heading) * step;
  motion.z += Math.cos(motion.heading) * step;
  return false;
}

/** Metre-space arrival tolerance follows the body, not a six-centimetre point turn. */
export function groundAnimalArrivalRadius(bodyLength: number): number {
  return Math.max(0.1, Math.min(0.6, bodyLength * 0.15));
}

/**
 * Extra support around an autonomous resting point for a slow departure turn.
 * @param bodyLength Scaled body length in metres.
 * @param speed Requested speed in metres per second; zero retains the body-sized clearance.
 * @param steering Turning policy used by the movement solver.
 * @returns Conservative clearance in metres, excluding the collision footprint.
 */
export function groundAnimalTurnClearance(
  bodyLength: number,
  speed = 0,
  steering?: Readonly<AnimalSteeringOptions>
): number {
  const angularSpeed = Math.min(steering?.maxAngularSpeed ?? 0.3, speed / Math.max(0.1, bodyLength * 1.25));
  const retainedSpeed = Math.min(
    speed,
    Math.max(speed * (steering?.turnSpeedRatio ?? 0), angularSpeed * Math.max(0.1, bodyLength * 0.75))
  );
  // A half-turn sweeps a diameter; reserve one second of cruise for the yaw ramp.
  return Math.max(
    0.1,
    bodyLength * 1.25,
    angularSpeed > 0 && (steering?.turnSpeedRatio ?? 0) > 0 ? (2 * retainedSpeed) / angularSpeed + speed : 0
  );
}
