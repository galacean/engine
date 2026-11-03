import { FARMING_SIMULATION_CONFIG } from "../config/FarmingSimulationConfig";
import type {
  CropGrowthConditions,
  CropGrowthFactorDefinition,
  CropGrowthFactorId,
  CropGrowthFactors,
  CropGrowthFactorStatus
} from "./FarmDefinitions";

export const CROP_GROWTH_FACTOR_ORDER: readonly CropGrowthFactorId[] = Object.freeze([
  "soilMoisture",
  "airTemperature",
  "light",
  "soilPh",
  "pestPressure"
]);

export const CROP_GROWTH_FACTOR_META: Readonly<
  Record<CropGrowthFactorId, Readonly<{ name: string; unit: string; minimum: number; maximum: number }>>
> = Object.freeze({
  soilMoisture: Object.freeze({ name: "土壤含水率", unit: "%", minimum: 0, maximum: 100 }),
  airTemperature: Object.freeze({ name: "空气温度", unit: "°C", minimum: -10, maximum: 50 }),
  light: Object.freeze({ name: "光照", unit: "%", minimum: 0, maximum: 100 }),
  soilPh: Object.freeze({ name: "土壤 pH", unit: "pH", minimum: 3, maximum: 10 }),
  pestPressure: Object.freeze({ name: "病虫压力", unit: "%", minimum: 0, maximum: 100 })
});

export function evaluateTrapezoid(definition: CropGrowthFactorDefinition, value: number): number {
  if (value < definition.minimum || value > definition.maximum) return 0;
  if (value >= definition.optimalMinimum && value <= definition.optimalMaximum) return 1_000;
  if (value < definition.optimalMinimum) {
    const width = definition.optimalMinimum - definition.minimum;
    return width === 0 ? 1_000 : Math.round(((value - definition.minimum) / width) * 1_000);
  }
  const width = definition.maximum - definition.optimalMaximum;
  return width === 0 ? 1_000 : Math.round(((definition.maximum - value) / width) * 1_000);
}

/** Water changes speed only: 20% at/below the dry floor, 100% at/above saturation. */
export function evaluateSoilMoistureGrowth(
  value: number,
  minimum: number = FARMING_SIMULATION_CONFIG.water.minimumMoisture,
  maximum: number = FARMING_SIMULATION_CONFIG.water.capacity
): number {
  const fraction = maximum > minimum ? Math.max(0, Math.min(1, (value - minimum) / (maximum - minimum))) : 1;
  return Math.round(200 + 800 * fraction);
}

export function combineGrowthCoefficients(water: number, environment: number): number {
  return environment > 0 ? Math.max(1, Math.round((water * environment) / 1000)) : 0;
}

export function evaluateCropGrowthFactors(
  factors: CropGrowthFactors,
  conditions: CropGrowthConditions,
  soil: { minimumMoistureUnits: number; maximumMoistureUnits: number } = {
    minimumMoistureUnits: FARMING_SIMULATION_CONFIG.water.minimumMoisture,
    maximumMoistureUnits: FARMING_SIMULATION_CONFIG.water.capacity
  }
): Readonly<{
  coefficientPermille: number;
  limitingFactorId: CropGrowthFactorId;
  factors: readonly CropGrowthFactorStatus[];
}> {
  const statuses = CROP_GROWTH_FACTOR_ORDER.map((id) => {
    const value = conditions[id];
    return Object.freeze({
      id,
      name: CROP_GROWTH_FACTOR_META[id].name,
      unit: CROP_GROWTH_FACTOR_META[id].unit,
      value,
      coefficientPermille:
        id === "soilMoisture"
          ? evaluateSoilMoistureGrowth(value, soil.minimumMoistureUnits, soil.maximumMoistureUnits)
          : evaluateTrapezoid(factors[id], value)
    });
  });
  const limiting = statuses.reduce((current, candidate) =>
    candidate.coefficientPermille < current.coefficientPermille ? candidate : current
  );
  return Object.freeze({
    coefficientPermille: combineGrowthCoefficients(
      statuses[0].coefficientPermille,
      Math.min(...statuses.slice(1).map((factor) => factor.coefficientPermille))
    ),
    limitingFactorId: limiting.id,
    factors: Object.freeze(statuses)
  });
}

export function validateCropGrowthFactors(factors: CropGrowthFactors, cropId: string): void {
  for (const id of CROP_GROWTH_FACTOR_ORDER) {
    const factor = factors[id];
    if (!factor) throw new Error(`Missing growth factor: ${cropId}/${id}`);
    const values = [factor.minimum, factor.optimalMinimum, factor.optimalMaximum, factor.maximum];
    if (values.some((value) => !Number.isFinite(value))) throw new Error(`Invalid growth factor: ${cropId}/${id}`);
    if (
      !(
        factor.minimum <= factor.optimalMinimum &&
        factor.optimalMinimum <= factor.optimalMaximum &&
        factor.optimalMaximum <= factor.maximum
      )
    ) {
      throw new Error(`Growth factor thresholds must be ordered: ${cropId}/${id}`);
    }
    const meta = CROP_GROWTH_FACTOR_META[id];
    if (factor.minimum < meta.minimum || factor.maximum > meta.maximum) {
      throw new Error(`Growth factor thresholds exceed metric range: ${cropId}/${id}`);
    }
  }
}

export function calculateHarvestQuantity(baseQuantity: number, healthPermille: number): number {
  if (healthPermille <= 0) return 0;
  return Math.max(1, Math.round((baseQuantity * Math.min(1_000, healthPermille)) / 1_000));
}
