export type PrecipitationVector3Tuple = [number, number, number];

const ZERO_PRECIPITATION_VELOCITY = [0, 0, 0] as const;

export interface PrecipitationParticleTrajectoryState {
  readonly positionWS: PrecipitationVector3Tuple;
  readonly velocityWS: PrecipitationVector3Tuple;
}

/** Reusable storage for the rain-impact launch hot path. */
export interface RainImpactLaunchTrajectoryState {
  readonly spawnPositionWS: PrecipitationVector3Tuple;
  readonly velocityWS: PrecipitationVector3Tuple;
  readonly directionWS: PrecipitationVector3Tuple;
  speedMps: number;
  flightTimeSeconds: number;
}

export function createRainImpactLaunchTrajectoryState(): RainImpactLaunchTrajectoryState {
  return {
    spawnPositionWS: [0, 0, 0],
    velocityWS: [0, 0, 0],
    directionWS: [0, 0, 0],
    speedMps: 0,
    flightTimeSeconds: 0
  };
}

/** Copies a finite horizontal air-velocity target without imposing a consumer-side speed ceiling. */
export function resolveHorizontalPrecipitationWindVelocity(
  windVelocityWS: readonly [number, number, number],
  out: PrecipitationVector3Tuple = [0, 0, 0]
): PrecipitationVector3Tuple {
  const x = windVelocityWS[0];
  const z = windVelocityWS[2];
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    throw new RangeError("Precipitation wind velocity must be finite");
  }
  out[0] = x;
  out[1] = 0;
  out[2] = z;
  return out;
}

/** Converts a physical world-space velocity into the particle system's simulation-time velocity. */
export function resolveParticleSimulationWindVelocity(
  physicalVelocityWS: readonly [number, number, number],
  simulationSpeed: number,
  out: PrecipitationVector3Tuple = [0, 0, 0]
): PrecipitationVector3Tuple {
  if (!Number.isFinite(simulationSpeed) || simulationSpeed <= 0) {
    throw new RangeError("Particle simulation speed must be finite and positive");
  }
  for (let axis = 0; axis < 3; axis++) {
    const velocity = physicalVelocityWS[axis];
    if (!Number.isFinite(velocity)) {
      throw new RangeError("Physical precipitation velocity must be finite");
    }
    out[axis] = velocity / simulationSpeed;
  }
  return out;
}

/** Returns whether the next particle-simulation step reaches or crosses an absolute simulation time. */
export function willParticleSimulationStepReachTime(
  currentSimulationTime: number,
  deltaSimulationTime: number,
  targetSimulationTime: number
): boolean {
  if (
    !Number.isFinite(currentSimulationTime) ||
    !Number.isFinite(deltaSimulationTime) ||
    !Number.isFinite(targetSimulationTime) ||
    deltaSimulationTime < 0
  ) {
    throw new RangeError("Particle simulation times must be finite and the step must be non-negative");
  }

  const nextSimulationTime = currentSimulationTime + deltaSimulationTime;
  // The target is formed by one addition while the play time advances through repeated additions.
  // A tiny step-relative tolerance absorbs that accumulation error without moving the event by a frame.
  const tolerance = Math.max(
    deltaSimulationTime * 1e-6,
    Math.max(1, Math.abs(currentSimulationTime), Math.abs(nextSimulationTime), Math.abs(targetSimulationTime)) *
      Number.EPSILON *
      8
  );
  return nextSimulationTime + tolerance >= targetSimulationTime;
}

/**
 * Centers a wind-relaxed particle path around the observer by moving its emitter upwind.
 * The displacement follows the continuous first-order solution from zero horizontal velocity.
 */
export function resolveWindRelaxedEmitterOffset(
  targetVelocityWS: readonly [number, number, number],
  responseTimeSeconds: number,
  lifetimeSeconds: number,
  out: PrecipitationVector3Tuple = [0, 0, 0]
): PrecipitationVector3Tuple {
  if (!Number.isFinite(responseTimeSeconds) || responseTimeSeconds < 0) {
    throw new RangeError("Precipitation wind response time must be finite and non-negative");
  }
  if (!Number.isFinite(lifetimeSeconds) || lifetimeSeconds < 0) {
    throw new RangeError("Precipitation lifetime must be finite and non-negative");
  }
  resolveWindRelaxedDisplacement(
    targetVelocityWS,
    responseTimeSeconds,
    lifetimeSeconds,
    ZERO_PRECIPITATION_VELOCITY,
    out
  );
  out[0] = out[0] === 0 ? 0 : out[0] * -0.5;
  out[1] = 0;
  out[2] = out[2] === 0 ? 0 : out[2] * -0.5;
  return out;
}

/**
 * Selects the longest emitter lead horizon whose exact relaxed trajectory stays within a camera-local
 * horizontal travel budget. Particle lifetime remains independent; low winds use the supplied maximum horizon.
 */
export function resolveCameraLocalPrecipitationTraversalTime(
  targetVelocityWS: readonly [number, number, number],
  responseTimeSeconds: number,
  maximumTraversalTimeSeconds: number,
  maxHorizontalTravelMeters: number
): number {
  if (!Number.isFinite(responseTimeSeconds) || responseTimeSeconds < 0) {
    throw new RangeError("Precipitation wind response time must be finite and non-negative");
  }
  if (!Number.isFinite(maximumTraversalTimeSeconds) || maximumTraversalTimeSeconds <= 0) {
    throw new RangeError("Maximum precipitation traversal time must be finite and positive");
  }
  if (!Number.isFinite(maxHorizontalTravelMeters) || maxHorizontalTravelMeters <= 0) {
    throw new RangeError("Camera-local precipitation travel must be finite and positive");
  }
  const horizontalSpeed = Math.hypot(targetVelocityWS[0], targetVelocityWS[2]);
  if (!Number.isFinite(horizontalSpeed)) {
    throw new RangeError("Precipitation wind velocity must be finite");
  }
  if (
    horizontalSpeed <= 1e-8 ||
    resolveRelaxedTravelDistance(horizontalSpeed, responseTimeSeconds, maximumTraversalTimeSeconds) <=
      maxHorizontalTravelMeters
  ) {
    return maximumTraversalTimeSeconds;
  }

  let lower = 0;
  let upper = maximumTraversalTimeSeconds;
  for (let iteration = 0; iteration < 40; iteration++) {
    const middle = (lower + upper) * 0.5;
    if (resolveRelaxedTravelDistance(horizontalSpeed, responseTimeSeconds, middle) <= maxHorizontalTravelMeters) {
      lower = middle;
    } else {
      upper = middle;
    }
  }
  return lower;
}

function resolveRelaxedTravelDistance(speed: number, responseTimeSeconds: number, durationSeconds: number): number {
  if (responseTimeSeconds <= 1e-8) return speed * durationSeconds;
  return speed * (durationSeconds - responseTimeSeconds * (1 - Math.exp(-durationSeconds / responseTimeSeconds)));
}

/** Exact displacement while velocity relaxes toward a constant air-velocity target. */
export function resolveWindRelaxedDisplacement(
  targetVelocityWS: readonly [number, number, number],
  responseTimeSeconds: number,
  durationSeconds: number,
  initialVelocityWS: readonly [number, number, number] = ZERO_PRECIPITATION_VELOCITY,
  out: PrecipitationVector3Tuple = [0, 0, 0]
): PrecipitationVector3Tuple {
  if (!Number.isFinite(responseTimeSeconds) || responseTimeSeconds < 0) {
    throw new RangeError("Precipitation wind response time must be finite and non-negative");
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
    throw new RangeError("Precipitation trajectory duration must be finite and non-negative");
  }
  const decay = responseTimeSeconds > 1e-8 ? Math.exp(-durationSeconds / responseTimeSeconds) : 0;
  for (let axis = 0; axis < 3; axis++) {
    const targetVelocity = targetVelocityWS[axis];
    const initialVelocity = initialVelocityWS[axis];
    if (!Number.isFinite(targetVelocity) || !Number.isFinite(initialVelocity)) {
      throw new RangeError("Precipitation trajectory velocity must be finite");
    }
    out[axis] =
      responseTimeSeconds > 1e-8
        ? targetVelocity * durationSeconds + (initialVelocity - targetVelocity) * responseTimeSeconds * (1 - decay)
        : targetVelocity * durationSeconds;
  }
  return out;
}

/** Mirrors the particle feedback shader's exact relaxation and position integration. */
export function advanceWindRelaxedParticleTrajectory(
  state: PrecipitationParticleTrajectoryState,
  targetVelocityWS: readonly [number, number, number],
  influence: readonly [number, number, number],
  responseTimeSeconds: number,
  deltaTimeSeconds: number
): void {
  if (!Number.isFinite(responseTimeSeconds) || responseTimeSeconds < 0) {
    throw new RangeError("Precipitation wind response time must be finite and non-negative");
  }
  if (!Number.isFinite(deltaTimeSeconds) || deltaTimeSeconds < 0) {
    throw new RangeError("Precipitation trajectory delta time must be finite and non-negative");
  }
  for (let axis = 0; axis < 3; axis++) {
    const targetVelocity = targetVelocityWS[axis];
    const axisInfluence = influence[axis];
    if (!Number.isFinite(targetVelocity) || !Number.isFinite(axisInfluence)) {
      throw new RangeError("Precipitation wind trajectory inputs must be finite");
    }
    const follow = Math.max(0, Math.min(1, axisInfluence));
    const currentVelocity = state.velocityWS[axis];
    if (follow <= 1e-8) {
      state.positionWS[axis] += currentVelocity * deltaTimeSeconds;
    } else if (responseTimeSeconds <= 1e-8) {
      state.velocityWS[axis] = targetVelocity;
      state.positionWS[axis] += targetVelocity * deltaTimeSeconds;
    } else {
      const responseRate = follow / responseTimeSeconds;
      const decay = Math.exp(-responseRate * deltaTimeSeconds);
      state.positionWS[axis] +=
        targetVelocity * deltaTimeSeconds + ((currentVelocity - targetVelocity) * (1 - decay)) / responseRate;
      state.velocityWS[axis] = targetVelocity + (currentVelocity - targetVelocity) * decay;
    }
  }
}

/**
 * Builds a wind-aligned near-ground streak whose frozen birth trajectory reaches the selected hit.
 * The horizontal launch velocity is the average velocity of a zero-horizontal-speed rain drop
 * relaxing toward the sampled air velocity, so its displacement matches the main rain trajectory without
 * allowing later global wind changes to move the streak away from its scheduled splash.
 */
export function resolveRainImpactLaunchTrajectory(
  targetPositionWS: readonly [number, number, number],
  airVelocityWS: readonly [number, number, number],
  responseTimeSeconds: number,
  fallHeightMeters: number,
  fallSpeedMps: number,
  out: RainImpactLaunchTrajectoryState = createRainImpactLaunchTrajectoryState()
): RainImpactLaunchTrajectoryState {
  if (!Number.isFinite(fallHeightMeters) || fallHeightMeters <= 0) {
    throw new RangeError("Rain impact fall height must be finite and positive");
  }
  if (!Number.isFinite(fallSpeedMps) || fallSpeedMps <= 0) {
    throw new RangeError("Rain impact fall speed must be finite and positive");
  }
  if (!Number.isFinite(responseTimeSeconds) || responseTimeSeconds < 0) {
    throw new RangeError("Rain impact wind response time must be finite and non-negative");
  }
  if (
    !Number.isFinite(targetPositionWS[0]) ||
    !Number.isFinite(targetPositionWS[1]) ||
    !Number.isFinite(targetPositionWS[2]) ||
    !Number.isFinite(airVelocityWS[0]) ||
    !Number.isFinite(airVelocityWS[2])
  ) {
    throw new RangeError("Rain impact trajectory inputs must be finite");
  }

  const flightTimeSeconds = fallHeightMeters / fallSpeedMps;
  const relaxedDisplacementTime =
    responseTimeSeconds > 1e-8
      ? flightTimeSeconds - responseTimeSeconds * (1 - Math.exp(-flightTimeSeconds / responseTimeSeconds))
      : flightTimeSeconds;
  const displacementX = airVelocityWS[0] * relaxedDisplacementTime;
  const displacementZ = airVelocityWS[2] * relaxedDisplacementTime;
  const velocityX = displacementX / flightTimeSeconds;
  const velocityZ = displacementZ / flightTimeSeconds;
  const velocityY = -fallSpeedMps;
  const speedMps = Math.hypot(velocityX, velocityY, velocityZ);
  const spawnPositionWS = out.spawnPositionWS;
  spawnPositionWS[0] = targetPositionWS[0] - displacementX;
  spawnPositionWS[1] = targetPositionWS[1] + fallHeightMeters;
  spawnPositionWS[2] = targetPositionWS[2] - displacementZ;
  const velocityWS = out.velocityWS;
  velocityWS[0] = velocityX;
  velocityWS[1] = velocityY;
  velocityWS[2] = velocityZ;
  const directionWS = out.directionWS;
  directionWS[0] = velocityX / speedMps;
  directionWS[1] = velocityY / speedMps;
  directionWS[2] = velocityZ / speedMps;
  out.speedMps = speedMps;
  out.flightTimeSeconds = flightTimeSeconds;
  return out;
}

/** Euler rotation that points a shape's authored -Z emission axis along the supplied direction. */
export function negativeZDirectionEulerDegrees(
  direction: readonly [number, number, number],
  out: PrecipitationVector3Tuple = [0, 0, 0]
): PrecipitationVector3Tuple {
  const length = Math.hypot(...direction);
  if (!Number.isFinite(length) || length <= 1e-8) {
    throw new RangeError("Precipitation launch direction must be finite and non-zero");
  }
  const x = direction[0] / length;
  const y = direction[1] / length;
  const z = direction[2] / length;
  const radiansToDegrees = 180 / Math.PI;
  out[0] = Math.asin(Math.max(-1, Math.min(1, y))) * radiansToDegrees;
  out[1] = Math.atan2(-x, -z) * radiansToDegrees;
  out[2] = 0;
  return out;
}
