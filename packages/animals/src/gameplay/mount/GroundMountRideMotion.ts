/** Reused result of one kinematic riding step; SI units throughout. */
export interface GroundMountRideStep {
  speed: number;
  distance: number;
  yawDelta: number;
}

/**
 * Integrate throttle/brake and bounded-curvature steering without allocations.
 * @param speed - Current forward speed in metres per second.
 * @param throttle - Positive accelerates, negative brakes, zero coasts to a stop.
 * @param steering - Signed rein input; never creates rotation without travel.
 * @param topSpeed - Desired gait speed in metres per second.
 * @param dt - Bounded integration step in seconds.
 * @param out - Reused step result.
 * @param accelerationScale - Positive multiplier adapting acceleration to host movement speeds.
 */
export function stepGroundMountRide(
  speed: number,
  throttle: number,
  steering: number,
  topSpeed: number,
  dt: number,
  out: GroundMountRideStep,
  accelerationScale = 1
): void {
  const target = throttle > 0 ? topSpeed : 0;
  const acceleration = (throttle < 0 ? 6 : throttle > 0 ? 3 : 3.5) * accelerationScale;
  const next = speed + Math.max(-acceleration * dt, Math.min(acceleration * dt, target - speed));
  out.speed = next < 0.015 ? 0 : next;
  out.distance = (speed + out.speed) * 0.5 * dt;
  // Larger turning radii at speed; stationary ground mounts do not rotate on planted feet.
  const radius = 1.8 + speed * speed * 0.14;
  out.yawDelta = (Math.max(-1, Math.min(1, steering)) * out.distance) / radius;
}
