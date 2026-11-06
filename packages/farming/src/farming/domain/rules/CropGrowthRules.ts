import type {
  CropDefinition,
  CropGrowthFactorId,
  CropGrowthFactorStatus,
  CropStageDefinition,
  FarmingDefinitionSet
} from "../FarmDefinitions";
import type { CropState, FarmSnapshot, PlotState } from "../FarmState";
import {
  combineGrowthCoefficients,
  evaluateSoilMoistureGrowth,
  evaluateCropGrowthFactors,
  evaluateTrapezoid
} from "../GrowthFactors";

export function resolveCropStage(crop: CropDefinition, growthUnits: number): CropStageDefinition {
  let resolved = crop.cycle.stages[0];
  for (const stage of crop.cycle.stages) {
    if (growthUnits / crop.cycle.growthTarget < stage.minimumProgress) break;
    resolved = stage;
  }
  return resolved;
}

export function cropProgressPercent(crop: CropDefinition, growthUnits: number): number {
  if (growthUnits >= crop.cycle.growthTarget) return 100;
  return Math.min(99, Math.max(0, Math.round((growthUnits / crop.cycle.growthTarget) * 100)));
}

export function isCropMature(crop: CropDefinition, growthUnits: number): boolean {
  return growthUnits >= crop.cycle.growthTarget;
}

export function getCrop(definitions: FarmingDefinitionSet, cropId: string): CropDefinition | undefined {
  return definitions.catalog.crops.find((crop) => crop.id === cropId);
}

export function getCropState(snapshot: FarmSnapshot, plot: PlotState): CropState | null {
  return plot.occupantId ? (snapshot.crops[plot.occupantId] ?? null) : null;
}

export function resolveGrowthEvaluation(
  definitions: FarmingDefinitionSet,
  crop: CropDefinition,
  plot: PlotState,
  cropState: CropState,
  environmentState: FarmSnapshot["environment"]
): Readonly<{
  coefficientPermille: number;
  limitingFactorId: CropGrowthFactorId | null;
  factors: readonly CropGrowthFactorStatus[];
}> {
  const environment = environmentState;
  const evaluation = evaluateCropGrowthFactors(
    crop.growthFactors,
    {
      soilMoisture: plot.soil.moistureUnits,
      airTemperature: environment.airTemperatureTenths / 10,
      light: environment.lightUnits,
      soilPh: plot.soil.phTenths / 10,
      pestPressure: cropState.pestPressureUnits
    },
    definitions.soilProfile
  );
  return evaluation;
}

/** Simulation needs a scalar, not five frozen presentation status records per time step. */
export function resolveGrowthCoefficient(
  definitions: FarmingDefinitionSet,
  crop: CropDefinition,
  plot: PlotState,
  cropState: CropState,
  environment: FarmSnapshot["environment"]
): number {
  const factors = crop.growthFactors;
  const environmentCoefficient = Math.min(
    evaluateTrapezoid(factors.airTemperature, environment.airTemperatureTenths / 10),
    evaluateTrapezoid(factors.light, environment.lightUnits),
    evaluateTrapezoid(factors.soilPh, plot.soil.phTenths / 10),
    evaluateTrapezoid(factors.pestPressure, cropState.pestPressureUnits)
  );
  return combineGrowthCoefficients(
    evaluateSoilMoistureGrowth(
      plot.soil.moistureUnits,
      definitions.soilProfile.minimumMoistureUnits,
      definitions.soilProfile.maximumMoistureUnits
    ),
    environmentCoefficient
  );
}
