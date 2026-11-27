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
