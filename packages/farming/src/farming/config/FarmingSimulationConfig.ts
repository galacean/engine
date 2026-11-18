/** Bump when transport order or water rules change; existing saves must not silently replay different physics. */
export const FARMING_SIMULATION_RULES_VERSION = 6;

export const MAX_GROWTH_MULTIPLIER = 100;

/** Engine-free gameplay defaults. Rates use simulation time, never render frame time. */
export const FARMING_SIMULATION_CONFIG = Object.freeze({
  /** Positive whole seconds in ms. Larger steps reduce work but require slower diffusion. */
  stepMs: 3_000,
  /** Positive ms of offline simulation to credit; larger values cost more catch-up work. */
  maximumCatchUpMs: 3_600_000,
  /** Positive ms between durable checkpoints; actions always commit immediately. */
  checkpointIntervalMs: 6_000,
  /** Session controls: only growth advances faster, not water transport or the world clock. */
  cropGrowthMultiplier: 1,
  /** In (0, 1). Maximum step * summed exchange rate; reject unsafe configurations. */
  diffusionStabilityLimit: 0.9,
  water: Object.freeze({
    /** Volumetric water content in percentage points; loam saturation (FAO AquaCrop). */
    capacity: 46,
    /** Model dry limit, half the loam wilting point (FAO-56 surface evaporation). */
    minimumMoisture: 7.5,
    /** Dryness label threshold; never stops crop growth. */
    wiltingPoint: 15,
    /** Falling-rate evaporation begins below this water content. */
    evaporationSlowdownThreshold: 22,
    /** Initial content in [minimumMoisture, fieldCapacity]. */
    initialMoisture: 25,
    /** In [0, capacity]; descriptive holding capacity, not an automatic drainage threshold. */
    fieldCapacity: 31,
    /** Positive units per action; overflow is conserved until no connected capacity remains. */
    wateringAmount: 12,
    /** Percentage points/simulation minute; gameplay pacing, not a weather-calibrated rate. */
    evaporationPerMinute: 1.2,
    /** Nonnegative m²/s; water exchange on cultivated, level soil. */
    leveledDiffusivity: 0.1,
    /** Positive dimensionless weight; raises absorption share, never creates water. */
    leveledIntakeMultiplier: 2
  })
});

export interface FarmingSimulationConfig {
  readonly stepMs: number;
  readonly maximumCatchUpMs: number;
  readonly checkpointIntervalMs: number;
  readonly cropGrowthMultiplier: number;
  readonly diffusionStabilityLimit: number;
  readonly water: { readonly [K in keyof typeof FARMING_SIMULATION_CONFIG.water]: number };
}
export type FarmingSimulationOverrides = Partial<Omit<FarmingSimulationConfig, "water">> & {
  readonly water?: Partial<FarmingSimulationConfig["water"]>;
};

/** Serialized rules and JavaScript callers must obey the same keys as the typed contract. */
function validateSimulationKeys(config: FarmingSimulationOverrides): void {
  for (const key of Object.keys(config)) {
    if (!Object.prototype.hasOwnProperty.call(FARMING_SIMULATION_CONFIG, key))
      throw new Error(`Unknown farming simulation parameter: ${key}`);
  }
}

export function resolveSimulationConfig(
  soil: import("../domain/FarmDefinitions").SoilProfileDefinition,
  overrides: FarmingSimulationOverrides = {}
): FarmingSimulationConfig {
  validateSimulationKeys(overrides);
  return Object.freeze({
    ...FARMING_SIMULATION_CONFIG,
    ...overrides,
    water: Object.freeze({
      ...FARMING_SIMULATION_CONFIG.water,
      capacity: soil.maximumMoistureUnits,
      minimumMoisture: soil.minimumMoistureUnits,
      wiltingPoint: soil.wiltingPointUnits,
      evaporationSlowdownThreshold: soil.evaporationSlowdownThresholdUnits,
      initialMoisture: soil.initialMoistureUnits,
      fieldCapacity: soil.fieldCapacityUnits,
      wateringAmount: soil.wateringUnitsPerAction,
      evaporationPerMinute: soil.evaporationUnitsPerMinute,
      ...overrides.water
    })
  });
}

/** Intrinsic rules can be validated before a farm grid exists. */
export function validateSimulationParameters(config: FarmingSimulationConfig): void {
  validateSimulationKeys(config);
  if (
    !Number.isFinite(config.cropGrowthMultiplier) ||
    config.cropGrowthMultiplier < 0 ||
    config.cropGrowthMultiplier > MAX_GROWTH_MULTIPLIER
  )
    throw new Error(`Growth multipliers must be between 0 and ${MAX_GROWTH_MULTIPLIER}.`);
  const w = config.water;
  if (
    !Number.isSafeInteger(config.stepMs) ||
    config.stepMs <= 0 ||
    config.stepMs % 1000 ||
    !Number.isSafeInteger(config.maximumCatchUpMs) ||
    config.maximumCatchUpMs <= 0 ||
    !Number.isFinite(config.checkpointIntervalMs) ||
    config.checkpointIntervalMs <= 0 ||
    !Number.isFinite(config.diffusionStabilityLimit) ||
    config.diffusionStabilityLimit <= 0 ||
    config.diffusionStabilityLimit >= 1 ||
    Object.values(w).some((v) => !Number.isFinite(v) || v < 0) ||
    w.capacity <= 0 ||
    w.capacity > 100 ||
    w.wateringAmount <= 0 ||
    w.leveledIntakeMultiplier <= 0 ||
    w.minimumMoisture >= w.capacity ||
    w.minimumMoisture > w.wiltingPoint ||
    w.wiltingPoint > w.fieldCapacity ||
    w.evaporationSlowdownThreshold < w.minimumMoisture ||
    w.evaporationSlowdownThreshold > w.fieldCapacity ||
    w.initialMoisture < w.minimumMoisture ||
    w.initialMoisture > w.fieldCapacity ||
    w.fieldCapacity > w.capacity
  )
    throw new Error("Invalid farming simulation configuration");
}

export function validateSimulationConfig(config: FarmingSimulationConfig, cellSize: number): void {
  validateSimulationParameters(config);
  if (!Number.isFinite(cellSize) || cellSize <= 0) throw new Error("Invalid farming simulation configuration");
  const w = config.water;
  const rate = ((config.stepMs / 1000) * 4 * w.leveledDiffusivity) / cellSize ** 2;
  if (rate > config.diffusionStabilityLimit)
    throw new Error(
      `Unstable farming diffusion (${rate} > ${config.diffusionStabilityLimit}): reduce diffusivity or stepMs, or increase cellSize.`
    );
}

/** Saved rules identity. Session growth controls deliberately reset on reload and are not part of the identity. */
export function simulationSignature(config: FarmingSimulationConfig): string {
  return JSON.stringify([
    FARMING_SIMULATION_RULES_VERSION,
    config.stepMs,
    config.maximumCatchUpMs,
    config.diffusionStabilityLimit,
    ...Object.keys(FARMING_SIMULATION_CONFIG.water).map((k) => config.water[k as keyof typeof config.water])
  ]);
}

/** The effective soil contract must match the water parameters used by simulation and restoration. */
export function simulationSoilProfile(
  soil: import("../domain/FarmDefinitions").SoilProfileDefinition,
  config: FarmingSimulationConfig
) {
  const water = config.water;
  return Object.freeze({
    ...soil,
    maximumMoistureUnits: water.capacity,
    minimumMoistureUnits: water.minimumMoisture,
    wiltingPointUnits: water.wiltingPoint,
    evaporationSlowdownThresholdUnits: water.evaporationSlowdownThreshold,
    initialMoistureUnits: water.initialMoisture,
    fieldCapacityUnits: water.fieldCapacity,
    wateringUnitsPerAction: water.wateringAmount,
    evaporationUnitsPerMinute: water.evaporationPerMinute
  });
}
