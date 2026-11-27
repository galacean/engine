import { resolveSimulationConfig, type FarmingSimulationConfig } from "../config/FarmingSimulationConfig";
import type { CropGrowthFactorId, CropGrowthFactorStatus, FarmingDefinitionSet } from "./FarmDefinitions";
import type { CropState, FarmSnapshot, PlotState } from "./FarmState";
import { calculateHarvestQuantity } from "./GrowthFactors";
import { getCrop, getCropState, resolveCropStage, resolveGrowthEvaluation } from "./rules/CropGrowthRules";
export { getActionAvailability } from "./FarmActions";
export type { ActionAvailability, BaseActionAvailability } from "./FarmActions";

export type CropHealthStatus = "normal" | "damaged" | "destroyed";
export function cropHealthStatus(healthPermille: number): CropHealthStatus {
  return healthPermille === 0 ? "destroyed" : healthPermille === 1000 ? "normal" : "damaged";
}

export type SoilMoistureLabel = "dry" | "low" | "moist" | "wet" | "saturated";
export const SOIL_MOISTURE_LABELS: Readonly<Record<SoilMoistureLabel, string>> = Object.freeze({
  dry: "干燥",
  low: "缺水",
  moist: "湿润",
  wet: "过湿",
  saturated: "饱和"
});

export interface CropStatusView {
  readonly instanceId: string;
  readonly plotId: string;
  readonly cropId: string;
  readonly cropName: string;
  readonly stageId: string;
  readonly stageName: string;
  readonly growthPermille: number;
  readonly idealRemainingMs: number;
  readonly estimatedRemainingMs: number | null;
  readonly healthStatus: CropHealthStatus;
  readonly pausedReason:
    | "destroyed"
    | "soil-too-dry"
    | "soil-too-wet"
    | "environment-unsuitable"
    | "ground-unavailable"
    | "growth-paused"
    | null;
  readonly factors: readonly CropGrowthFactorStatus[];
  readonly limitingFactorId: CropGrowthFactorId | null;
  readonly growthCoefficientPermille: number;
  readonly growthMultiplier: number;
  readonly healthPermille: number;
  readonly expectedHarvestQuantity: number;
  readonly maximumHarvestQuantity: number;
  readonly mature: boolean;
}

export interface PlotStatusView {
  readonly plotId: string;
  readonly soilMoistureUnits: number;
  readonly soilMoisturePercent: number;
  readonly soilMoistureLabel: SoilMoistureLabel;
  readonly crop: CropStatusView | null;
}

export function getFarmStatus(
  snapshot: FarmSnapshot,
  definitions: FarmingDefinitionSet,
  simulationConfig?: FarmingSimulationConfig
): readonly PlotStatusView[] {
  const config = simulationConfig ?? resolveSimulationConfig(definitions.soilProfile);
  return Object.freeze(snapshot.plots.map((plot) => createPlotStatus(snapshot, definitions, plot, config)));
}

export function getPlotStatus(
  snapshot: FarmSnapshot,
  definitions: FarmingDefinitionSet,
  plotId: string,
  simulationConfig?: FarmingSimulationConfig
): PlotStatusView | undefined {
  const plot = snapshot.plots.find((candidate) => candidate.plotId === plotId);
  return plot ? createPlotStatus(snapshot, definitions, plot, simulationConfig) : undefined;
}

export function createPlotStatus(
  snapshot: FarmSnapshot,
  definitions: FarmingDefinitionSet,
  plot: PlotState,
  simulationConfig?: FarmingSimulationConfig
): PlotStatusView {
  const cropState = getCropState(snapshot, plot);
  const resolved = simulationConfig ?? resolveSimulationConfig(definitions.soilProfile);
  return Object.freeze({
    plotId: plot.plotId,
    soilMoistureUnits: plot.soil.moistureUnits,
    soilMoisturePercent: Math.round(plot.soil.moistureUnits * 10) / 10,
    soilMoistureLabel: resolveSoilMoistureLabel(definitions, plot.soil.moistureUnits),
    crop: cropState
      ? createCropStatus(definitions, cropState, plot, snapshot.environment, resolved.cropGrowthMultiplier)
      : null
  });
}

export function getCropStatus(
  snapshot: FarmSnapshot,
  definitions: FarmingDefinitionSet,
  instanceId: string,
  simulationConfig?: FarmingSimulationConfig
): CropStatusView | undefined {
  const cropState = snapshot.crops[instanceId];
  if (!cropState) return undefined;
  const plot = snapshot.plots.find((candidate) => candidate.occupantId === instanceId);
  return plot
    ? createCropStatus(definitions, cropState, plot, snapshot.environment, simulationConfig?.cropGrowthMultiplier)
    : undefined;
}

export function createCropStatus(
  definitions: FarmingDefinitionSet,
  cropState: CropState,
  plot: PlotState,
  environment: FarmSnapshot["environment"],
  growthMultiplier = 1
): CropStatusView {
  const crop = getCrop(definitions, cropState.cropId)!;
  const remainingGrowth = Math.max(0, crop.cycle.growthTarget - cropState.growthUnits);
  const mature = remainingGrowth === 0;
  const evaluation = resolveGrowthEvaluation(definitions, crop, plot, cropState, environment);
  const multiplier =
    cropState.healthPermille > 0 && plot.ground.availability === "available" ? evaluation.coefficientPermille : 0;
  const idealMultiplier = 1_000;
  const idealRateNumerator = crop.cycle.baseGrowthUnitsPerSecond * idealMultiplier;
  const currentRateNumerator = crop.cycle.baseGrowthUnitsPerSecond * multiplier * growthMultiplier;
  const idealRemainingMs = mature ? 0 : Math.ceil((remainingGrowth * 1_000_000) / idealRateNumerator);
  const estimatedRemainingMs = mature
    ? 0
    : currentRateNumerator > 0
      ? Math.ceil((remainingGrowth * 1_000_000) / currentRateNumerator)
      : null;
  const stage = resolveCropStage(crop, cropState.growthUnits);
  return Object.freeze({
    instanceId: cropState.instanceId,
    plotId: cropState.anchorPlotId,
    cropId: crop.id,
    cropName: crop.name,
    stageId: stage.id,
    stageName: stage.name,
    growthPermille: mature
      ? 1_000
      : Math.min(999, Math.round((cropState.growthUnits / crop.cycle.growthTarget) * 1_000)),
    idealRemainingMs,
    estimatedRemainingMs,
    healthStatus: cropHealthStatus(cropState.healthPermille),
    pausedReason:
      cropState.healthPermille === 0
        ? "destroyed"
        : !mature && plot.ground.availability !== "available"
          ? "ground-unavailable"
          : !mature && growthMultiplier === 0
            ? "growth-paused"
            : !mature && multiplier === 0
              ? "environment-unsuitable"
              : null,
    factors: evaluation.factors,
    limitingFactorId: evaluation.limitingFactorId,
    growthCoefficientPermille: multiplier,
    growthMultiplier,
    healthPermille: cropState.healthPermille,
    expectedHarvestQuantity: calculateHarvestQuantity(crop.harvest.quantity, cropState.healthPermille),
    maximumHarvestQuantity: crop.harvest.quantity,
    mature
  });
}

export function resolveSoilMoistureLabel(definitions: FarmingDefinitionSet, moistureUnits: number): SoilMoistureLabel {
  const soil = definitions.soilProfile;
  if (moistureUnits >= soil.maximumMoistureUnits) return "saturated";
  if (moistureUnits > soil.fieldCapacityUnits) return "wet";
  if (moistureUnits <= soil.wiltingPointUnits) return "dry";
  return moistureUnits < soil.evaporationSlowdownThresholdUnits ? "low" : "moist";
}
