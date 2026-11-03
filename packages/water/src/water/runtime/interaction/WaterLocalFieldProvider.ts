/** Allocation-free channels sampled from body-local water effects. */
export enum WaterLocalModifierChannel {
  None = 0,
  DisplacementY = 1 << 0,
  DisplacementXZ = 1 << 1,
  CurrentLarge = 1 << 2,
  CurrentRipple = 1 << 3,
  FoamSource = 1 << 4,
  SimulationMask = 1 << 5
}

/** Caller-owned sample populated by a {@link WaterLocalFieldProvider}. */
export interface WaterLocalFieldSample {
  displacementY: number;
  displacementX: number;
  displacementZ: number;
  surfaceVelocityY: number;
  gradientX: number;
  gradientZ: number;
  currentLargeX: number;
  currentLargeZ: number;
  currentRippleX: number;
  currentRippleZ: number;
  foamSource: number;
  simulationMask: number;
}

/** Internal, allocation-free query contract for static and dynamic local water fields. */
export interface WaterLocalFieldProvider {
  readonly channels: number;

  /** Returns true when the world-XZ position overlaps this provider's actual field. */
  sampleLocalField(worldX: number, worldZ: number, outSample: WaterLocalFieldSample): boolean;
}

export function createWaterLocalFieldSample(): WaterLocalFieldSample {
  return {
    displacementY: 0,
    displacementX: 0,
    displacementZ: 0,
    surfaceVelocityY: 0,
    gradientX: 0,
    gradientZ: 0,
    currentLargeX: 0,
    currentLargeZ: 0,
    currentRippleX: 0,
    currentRippleZ: 0,
    foamSource: 0,
    simulationMask: 1
  };
}

/** Restores a caller-owned sample without replacing its identity. */
export function resetWaterLocalFieldSample(sample: WaterLocalFieldSample): void {
  sample.displacementY = 0;
  sample.displacementX = 0;
  sample.displacementZ = 0;
  sample.surfaceVelocityY = 0;
  sample.gradientX = 0;
  sample.gradientZ = 0;
  sample.currentLargeX = 0;
  sample.currentLargeZ = 0;
  sample.currentRippleX = 0;
  sample.currentRippleZ = 0;
  sample.foamSource = 0;
  sample.simulationMask = 1;
}
