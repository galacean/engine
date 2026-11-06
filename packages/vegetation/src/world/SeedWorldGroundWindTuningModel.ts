export interface SeedWorldGroundWindTuning {
  enabled: boolean;
  speedMps: number;
  directionDegrees: number;
  waveStrength: number;
  waveScaleMeters: number;
  meanBend: number;
  rootStiffness: number;
  noiseSpeedMps: number;
  noiseStrength: number;
  colorStrength: number;
  colorContrast: number;
}

export const SEED_WORLD_DEFAULT_GROUND_WIND_TUNING: Readonly<SeedWorldGroundWindTuning> = Object.freeze({
  enabled: true,
  speedMps: 3.5,
  directionDegrees: 76,
  waveStrength: 1.5,
  waveScaleMeters: 10,
  meanBend: 0.5,
  rootStiffness: 1,
  noiseSpeedMps: 1.25,
  noiseStrength: 0.25,
  colorStrength: 0,
  colorContrast: 0.9
});

export function validateGroundWindTuning(tuning: Readonly<SeedWorldGroundWindTuning>): void {
  if (typeof tuning.enabled !== "boolean") throw new TypeError(`enabled must be a boolean`);
  validateRange("speedMps", tuning.speedMps, 0, 8);
  validateRange("directionDegrees", tuning.directionDegrees, -180, 180);
  validateRange("waveStrength", tuning.waveStrength, 0, 1.5);
  validateRange("waveScaleMeters", tuning.waveScaleMeters, 3, 24);
  validateRange("meanBend", tuning.meanBend, 0, 1.2);
  validateRange("rootStiffness", tuning.rootStiffness, 0.6, 3);
  validateRange("noiseSpeedMps", tuning.noiseSpeedMps, 0, 4);
  validateRange("noiseStrength", tuning.noiseStrength, 0, 0.8);
  validateRange("colorStrength", tuning.colorStrength, 0, 1);
  validateRange("colorContrast", tuning.colorContrast, 0.5, 4);
}

function validateRange(name: string, value: number, minimum: number, maximum: number): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be finite and inside [${minimum}, ${maximum}]`);
  }
}
