import { FARM_CROP_CONTENT } from "../content/CropContent";
import {
  CROP_GROWTH_FACTOR_META,
  CROP_GROWTH_FACTOR_ORDER,
  evaluateSoilMoistureGrowth,
  evaluateTrapezoid
} from "../domain/GrowthFactors";
import type { CropGrowthFactorId, CropGrowthFactors } from "../domain/index";

export interface CropGrowthProfile {
  readonly cropId: string;
  readonly assetIds: readonly string[];
  readonly name: string;
  readonly factors: CropGrowthFactors;
  /** Display-only samples along normalized cycle progress; never growth-rule multipliers. */
  readonly stageSensitivity: Readonly<Record<CropGrowthFactorId, readonly number[]>>;
}

const SENSITIVITY_SAMPLE_PROGRESS = Object.freeze([0, 0.2, 0.4, 0.7, 1]);

const curve = (minimum: number, optimalMinimum: number, optimalMaximum: number, maximum: number) =>
  Object.freeze({ minimum, optimalMinimum, optimalMaximum, maximum });
const factors = (
  soilMoisture: readonly number[],
  airTemperature: readonly number[],
  light: readonly number[],
  soilPh: readonly number[],
  pestPressure: readonly number[]
): CropGrowthFactors =>
  Object.freeze({
    soilMoisture: curve(...(soilMoisture as [number, number, number, number])),
    airTemperature: curve(...(airTemperature as [number, number, number, number])),
    light: curve(...(light as [number, number, number, number])),
    soilPh: curve(...(soilPh as [number, number, number, number])),
    pestPressure: curve(...(pestPressure as [number, number, number, number]))
  });
const sensitivity = (values: Readonly<Record<CropGrowthFactorId, readonly number[]>>) => Object.freeze(values);

/** Loam gameplay baselines: moisture thresholds are volumetric percentages; other factors remain game presets. */
const BASE_PROFILES: readonly CropGrowthProfile[] = Object.freeze([
  profile(
    "tomato",
    ["tomato-farmlands"],
    "番茄",
    factors([15, 24, 31, 46], [8, 18, 28, 38], [10, 55, 100, 100], [4.5, 5.8, 6.8, 8], [0, 0, 8, 85]),
    sensitivitySet(
      [90, 80, 75, 95, 55],
      [85, 75, 65, 100, 60],
      [35, 70, 90, 90, 55],
      [45, 55, 60, 70, 55],
      [35, 55, 70, 95, 75]
    )
  ),
  profile(
    "rice",
    ["rice-quaternius"],
    "水稻",
    factors([15, 28, 46, 46], [10, 22, 32, 40], [12, 55, 100, 100], [4.2, 5, 6.8, 8], [0, 0, 6, 68]),
    sensitivitySet(
      [100, 95, 90, 100, 70],
      [85, 75, 70, 95, 60],
      [35, 75, 95, 90, 60],
      [50, 55, 65, 70, 50],
      [35, 55, 75, 95, 80]
    )
  )
]);

// Small reusable game presets. Every crop has an explicit association; no hidden fallback.
const PRESETS = {
  fruit: BASE_PROFILES[0],
  rice: BASE_PROFILES[1],
  root: {
    ...BASE_PROFILES[0],
    factors: factors([15, 22, 30, 43], [4, 14, 26, 36], [8, 45, 100, 100], [4.5, 5.5, 7.2, 8.5], [0, 0, 10, 85])
  },
  leaf: {
    ...BASE_PROFILES[0],
    factors: factors([15, 25, 33, 46], [3, 12, 26, 35], [5, 40, 100, 100], [4.5, 5.8, 7.2, 8.5], [0, 0, 8, 80])
  },
  grain: {
    ...BASE_PROFILES[0],
    factors: factors([15, 21, 31, 46], [3, 14, 28, 38], [12, 55, 100, 100], [4.5, 5.5, 7.5, 8.5], [0, 0, 10, 85])
  }
} as const;
export const CROP_GROWTH_PROFILES: readonly CropGrowthProfile[] = Object.freeze(
  FARM_CROP_CONTENT.map((crop) =>
    profile(
      crop.id,
      crop.id === "tomato" ? [crop.assetId, "tomato-bumroker"] : [crop.assetId],
      crop.name,
      PRESETS[crop.profile].factors,
      PRESETS[crop.profile].stageSensitivity
    )
  )
);

export function getCropGrowthProfileByAssetId(assetId: string): CropGrowthProfile | undefined {
  return CROP_GROWTH_PROFILES.find((candidate) => candidate.assetIds.includes(assetId));
}

export function getCropGrowthProfile(cropId: string): CropGrowthProfile | undefined {
  return CROP_GROWTH_PROFILES.find((candidate) => candidate.cropId === cropId);
}

export function calculateFactorToleranceScore(profile: CropGrowthProfile, id: CropGrowthFactorId): number {
  const factor = profile.factors[id];
  const meta = CROP_GROWTH_FACTOR_META[id];
  const samples = 80;
  let total = 0;
  for (let index = 0; index <= samples; index++) {
    const value = meta.minimum + ((meta.maximum - meta.minimum) * index) / samples;
    total += (id === "soilMoisture" ? evaluateSoilMoistureGrowth(value) : evaluateTrapezoid(factor, value)) / 1_000;
  }
  return Math.round((total / (samples + 1)) * 100);
}

function profile(
  cropId: string,
  assetIds: readonly string[],
  name: string,
  growthFactors: CropGrowthFactors,
  stageSensitivity: CropGrowthProfile["stageSensitivity"]
): CropGrowthProfile {
  for (const id of CROP_GROWTH_FACTOR_ORDER) {
    const values = stageSensitivity[id];
    if (
      values.length !== SENSITIVITY_SAMPLE_PROGRESS.length ||
      values.some((value) => !Number.isInteger(value) || value < 0 || value > 100)
    ) {
      throw new Error(`Invalid stage sensitivity: ${cropId}/${id}`);
    }
  }
  return Object.freeze({
    cropId,
    assetIds: Object.freeze([...assetIds]),
    name,
    factors: growthFactors,
    stageSensitivity
  });
}

function sensitivitySet(
  soilMoisture: readonly number[],
  airTemperature: readonly number[],
  light: readonly number[],
  soilPh: readonly number[],
  pestPressure: readonly number[]
): Readonly<Record<CropGrowthFactorId, readonly number[]>> {
  return Object.freeze({ soilMoisture, airTemperature, light, soilPh, pestPressure });
}

/** Resample annotation data for the actual species stages; this never enters the simulation. */
export function stageSensitivityAtProgress(
  profile: CropGrowthProfile,
  factor: CropGrowthFactorId,
  progress: number
): number {
  const values = profile.stageSensitivity[factor];
  for (let i = 1; i < SENSITIVITY_SAMPLE_PROGRESS.length; i++) {
    const start = SENSITIVITY_SAMPLE_PROGRESS[i - 1],
      end = SENSITIVITY_SAMPLE_PROGRESS[i];
    if (progress <= end)
      return Math.round(values[i - 1] + (values[i] - values[i - 1]) * Math.max(0, (progress - start) / (end - start)));
  }
  return values[values.length - 1];
}
