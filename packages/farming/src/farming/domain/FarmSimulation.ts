import { clearDestroyedCrops } from "./rules/CropDamageRules";
import { nearWaterEntry, nearWaterPerMinute, type FarmWaterSupplyInput } from "./FarmWaterSupply";
import { withFarmEnvironment, type FarmEnvironmentInput } from "./FarmEnvironment";
import {
  FARMING_SIMULATION_CONFIG,
  resolveSimulationConfig,
  validateSimulationConfig,
  type FarmingSimulationConfig
} from "../config/FarmingSimulationConfig";
import { buildWaterGraph } from "./fields/SoilWaterField";
import { transportField } from "./fields/SpatialField";
import { integrateSoilEvaporation, settleSoilMoisture, type SoilEvaporationIntegral } from "./SoilMoisture";
import type { FarmChange } from "./FarmCommands";
import type { CropDefinition, FarmingDefinitionSet } from "./FarmDefinitions";
import type { CropState, FarmSnapshot } from "./FarmState";
import { freezeSnapshot } from "./FarmState";
import { combineGrowthCoefficients, evaluateSoilMoistureGrowth, evaluateTrapezoid } from "./GrowthFactors";
import { getCrop, isCropMature, resolveCropStage, resolveGrowthCoefficient } from "./rules/CropGrowthRules";
import { requirePositiveInteger, requireSystemTime } from "./validationUtils";

export const FARM_SIMULATION_STEP_MS = FARMING_SIMULATION_CONFIG.stepMs;
export const FARM_MAX_CATCH_UP_MS = FARMING_SIMULATION_CONFIG.maximumCatchUpMs;
export const FARM_APPROXIMATE_OFFLINE_MAX_CATCH_UP_MS = 24 * 60 * 60 * 1_000;

const approximateEvapScratch: SoilEvaporationIntegral = { endMoisture: 0, averageMoisture: 0 };
const approximatePreEvapScratch: SoilEvaporationIntegral = { endMoisture: 0, averageMoisture: 0 };

export interface FarmTimeAdvanceSummary {
  readonly elapsedSystemTimeMs: number;
  readonly simulatedElapsedMs: number;
  readonly capped: boolean;
  readonly changes: readonly FarmChange[];
}

export interface SettleFarmTimeResult extends FarmTimeAdvanceSummary {
  readonly snapshot: FarmSnapshot;
  /** State that affects gameplay, including fractional growth before a visible change. */
  readonly stateChanged: boolean;
}

export function settleFarmTime(
  snapshot: FarmSnapshot,
  targetSystemTimeMs: number,
  definitions: FarmingDefinitionSet,
  options: {
    readonly environment?: FarmEnvironmentInput;
    readonly waterSupply?: FarmWaterSupplyInput;
    readonly simulationConfig?: FarmingSimulationConfig;
    readonly simulationStepMs?: number;
    readonly maximumCatchUpMs?: number;
  } = {}
): SettleFarmTimeResult {
  requireSystemTime(targetSystemTimeMs);
  snapshot = withFarmEnvironment(snapshot, options.environment);
  const config =
    options.simulationConfig ??
    resolveSimulationConfig(definitions.soilProfile, {
      stepMs: options.simulationStepMs ?? FARM_SIMULATION_STEP_MS,
      maximumCatchUpMs: options.maximumCatchUpMs ?? FARM_MAX_CATCH_UP_MS
    });
  validateSimulationConfig(config, snapshot.grid.cellSize);
  const stepMs = config.stepMs;
  const maximumCatchUpMs = config.maximumCatchUpMs;
  requirePositiveInteger(stepMs, "Simulation step");
  requirePositiveInteger(maximumCatchUpMs, "Maximum catch-up duration");
  if (stepMs % 1_000 !== 0) throw new Error("Simulation step must be a whole number of seconds.");
  const cleared = clearDestroyedCrops(snapshot);
  snapshot = cleared.snapshot;
  const rawElapsedMs = targetSystemTimeMs - snapshot.simulation.lastSystemTimeMs;
  if (rawElapsedMs <= 0) {
    return {
      snapshot,
      elapsedSystemTimeMs: Math.max(0, rawElapsedMs),
      simulatedElapsedMs: 0,
      capped: false,
      changes: cleared.changes,
      stateChanged: cleared.changes.length > 0
    };
  }
  const capped = rawElapsedMs > maximumCatchUpMs;
  const effectiveElapsedMs = Math.min(rawElapsedMs, maximumCatchUpMs);
  const accumulatedMs = snapshot.simulation.remainderMs + effectiveElapsedMs;
  const stepCount = Math.floor(accumulatedMs / stepMs);
  const remainderMs = accumulatedMs % stepMs;
  const previousSimulationTimeMs = snapshot.simulation.simulatedTimeMs;
  let simulatedTimeMs = previousSimulationTimeMs;
  const plots = snapshot.plots.map((plot) => ({ ...plot, soil: { ...plot.soil } }));
  const crops: Record<string, { -readonly [K in keyof CropState]: CropState[K] }> = Object.fromEntries(
    Object.entries(snapshot.crops).map(([id, crop]) => [id, { ...crop }])
  );
  const initialPlots = snapshot.plots;
  const initialCrops = snapshot.crops;
  const stepSeconds = stepMs / 1_000;

  const graph = buildWaterGraph(snapshot, config);
  let water = Float64Array.from(graph.plotIndices, (i) => plots[i].soil.moistureUnits),
    nextWater = new Float64Array(water.length);
  for (let step = 0; step < stepCount; step++) {
    const nextSimulationTimeMs = simulatedTimeMs + stepMs;
    const stepStart = snapshot.simulation.lastSystemTimeMs - snapshot.simulation.remainderMs + step * stepMs;
    transportField(graph, water, nextWater, stepSeconds, stepStart);
    [water, nextWater] = [nextWater, water];
    graph.plotIndices.forEach((i, n) => {
      plots[i].soil.moistureUnits = water[n];
    });
    for (let plotIndex = 0; plotIndex < plots.length; plotIndex++) {
      const plot = plots[plotIndex];
      const cropState = plot.occupantId ? crops[plot.occupantId] : undefined;
      if (cropState) {
        const crop = getCrop(definitions, cropState.cropId)!;
        const stepStartSystemTimeMs =
          snapshot.simulation.lastSystemTimeMs - snapshot.simulation.remainderMs + step * stepMs;
        if (
          plot.ground.availability === "available" &&
          (plot.ground.resumedAtSystemTimeMs === undefined ||
            stepStartSystemTimeMs >= plot.ground.resumedAtSystemTimeMs) &&
          cropState.healthPermille > 0 &&
          !isCropMature(crop, cropState.growthUnits)
        ) {
          const multiplier = resolveGrowthCoefficient(definitions, crop, plot, cropState, snapshot.environment);
          const numerator =
            cropState.growthRemainderPermille +
            Math.round(crop.cycle.baseGrowthUnitsPerSecond * stepSeconds * multiplier * config.cropGrowthMultiplier);
          const growthDelta = Math.floor(numerator / 1_000);
          cropState.growthUnits = Math.min(crop.cycle.growthTarget, cropState.growthUnits + growthDelta);
          if (growthDelta > 0 || multiplier > 0) cropState.growthRemainderPermille = numerator % 1_000;
        }
        cropState.lastEvaluatedSimulationMs = nextSimulationTimeMs;
      }

      plot.soil.moistureUnits = settleSoilMoisture(
        plot.soil.moistureUnits,
        config.water,
        stepMs / 60_000,
        options.environment?.snowing ? 0 : (options.environment?.rainWaterPerMinute ?? 0),
        nearWaterPerMinute(
          plot.soil.moistureUnits,
          config.water.minimumMoisture,
          options.waterSupply,
          nearWaterEntry(options.waterSupply, plot)
        )
      );
    }
    graph.plotIndices.forEach((i, n) => {
      water[n] = plots[i].soil.moistureUnits;
    });
    simulatedTimeMs = nextSimulationTimeMs;
  }

  const changes: FarmChange[] = [...cleared.changes];
  for (let index = 0; index < plots.length; index++) {
    const beforePlot = initialPlots[index];
    const afterPlot = plots[index];
    if (beforePlot.soil.moistureUnits !== afterPlot.soil.moistureUnits) {
      changes.push({
        kind: "soil-moisture-changed",
        plotId: afterPlot.plotId,
        previousMoistureUnits: beforePlot.soil.moistureUnits,
        moistureUnits: afterPlot.soil.moistureUnits
      });
    }
    if (!afterPlot.occupantId) continue;
    const beforeCrop = initialCrops[afterPlot.occupantId];
    const afterCrop = crops[afterPlot.occupantId];
    if (!beforeCrop || !afterCrop || beforeCrop.growthUnits === afterCrop.growthUnits) continue;
    const crop = getCrop(definitions, afterCrop.cropId)!;
    changes.push({
      kind: "crop-growth-applied",
      plotId: afterPlot.plotId,
      cropId: afterCrop.cropId,
      cropInstanceId: afterCrop.instanceId,
      previousGrowthUnits: beforeCrop.growthUnits,
      growthUnits: afterCrop.growthUnits
    });
    let previousStage = resolveCropStage(crop, beforeCrop.growthUnits);
    for (const stage of crop.cycle.stages) {
      if (
        stage.minimumProgress <= beforeCrop.growthUnits / crop.cycle.growthTarget ||
        stage.minimumProgress > afterCrop.growthUnits / crop.cycle.growthTarget
      )
        continue;
      changes.push({
        kind: "crop-stage-changed",
        plotId: afterPlot.plotId,
        cropId: afterCrop.cropId,
        cropInstanceId: afterCrop.instanceId,
        previousStageId: previousStage.id,
        stageId: stage.id
      });
      previousStage = stage;
    }
    if (!isCropMature(crop, beforeCrop.growthUnits) && isCropMature(crop, afterCrop.growthUnits)) {
      changes.push({
        kind: "crop-matured",
        plotId: afterPlot.plotId,
        cropId: afterCrop.cropId,
        cropInstanceId: afterCrop.instanceId
      });
    }
  }
  const stateChanged =
    changes.length > 0 ||
    Object.keys(crops).some((id) => crops[id].growthRemainderPermille !== initialCrops[id].growthRemainderPermille);
  if (simulatedTimeMs !== previousSimulationTimeMs) {
    changes.push({
      kind: "simulation-advanced",
      previousSimulationTimeMs,
      simulatedTimeMs,
      elapsedSystemTimeMs: effectiveElapsedMs,
      capped
    });
  }
  const next = freezeSnapshot({
    ...snapshot,
    simulation: { ...snapshot.simulation, lastSystemTimeMs: targetSystemTimeMs, simulatedTimeMs, remainderMs },
    plots,
    crops
  });
  return {
    snapshot: next,
    elapsedSystemTimeMs: rawElapsedMs,
    simulatedElapsedMs: simulatedTimeMs - previousSimulationTimeMs,
    capped,
    stateChanged,
    changes: Object.freeze(changes)
  };
}

function lookupCrop(definitions: FarmingDefinitionSet, cropId: string): CropDefinition | undefined {
  const catalog = definitions.catalog as FarmingDefinitionSet["catalog"] & {
    getCrop?: (id: string) => CropDefinition;
  };
  if (typeof catalog.getCrop === "function") return catalog.getCrop(cropId);
  return getCrop(definitions, cropId);
}

/**
 * O(plots) closed-form offline catch-up ignoring lateral diffusion, rain, and near-water recharge.
 * Soil evaporation and linear soil-moisture growth response are integrated analytically in O(1) per plot.
 */
export function settleFarmTimeApproximate(
  snapshot: FarmSnapshot,
  targetSystemTimeMs: number,
  definitions: FarmingDefinitionSet,
  options: {
    readonly environment?: FarmEnvironmentInput;
    readonly simulationConfig?: FarmingSimulationConfig;
    readonly simulationStepMs?: number;
    readonly maximumCatchUpMs?: number;
    /** Default true: offline growth uses the saved snapshot.environment instead of transient reopen weather. */
    readonly preserveSavedEnvironment?: boolean;
  } = {}
): SettleFarmTimeResult {
  requireSystemTime(targetSystemTimeMs);
  if (options.preserveSavedEnvironment === false) {
    snapshot = withFarmEnvironment(snapshot, options.environment);
  }
  const config =
    options.simulationConfig ??
    resolveSimulationConfig(definitions.soilProfile, {
      stepMs: options.simulationStepMs ?? FARM_SIMULATION_STEP_MS
    });
  validateSimulationConfig(config, snapshot.grid.cellSize);
  const stepMs = config.stepMs;
  const maximumCatchUpMs = options.maximumCatchUpMs ?? config.maximumCatchUpMs;
  requirePositiveInteger(stepMs, "Simulation step");
  requirePositiveInteger(maximumCatchUpMs, "Maximum catch-up duration");
  if (stepMs % 1_000 !== 0) throw new Error("Simulation step must be a whole number of seconds.");
  const cleared = clearDestroyedCrops(snapshot);
  snapshot = cleared.snapshot;
  const rawElapsedMs = targetSystemTimeMs - snapshot.simulation.lastSystemTimeMs;
  if (rawElapsedMs <= 0) {
    return {
      snapshot,
      elapsedSystemTimeMs: Math.max(0, rawElapsedMs),
      simulatedElapsedMs: 0,
      capped: false,
      changes: cleared.changes,
      stateChanged: cleared.changes.length > 0
    };
  }
  const capped = rawElapsedMs > maximumCatchUpMs;
  const effectiveElapsedMs = Math.min(rawElapsedMs, maximumCatchUpMs);
  const accumulatedMs = snapshot.simulation.remainderMs + effectiveElapsedMs;
  const stepCount = Math.floor(accumulatedMs / stepMs);
  const remainderMs = accumulatedMs % stepMs;
  const simulatedDeltaMs = stepCount * stepMs;
  const previousSimulationTimeMs = snapshot.simulation.simulatedTimeMs;
  const simulatedTimeMs = previousSimulationTimeMs + simulatedDeltaMs;

  if (stepCount === 0) {
    const next = freezeSnapshot({
      ...snapshot,
      simulation: { ...snapshot.simulation, lastSystemTimeMs: targetSystemTimeMs, simulatedTimeMs, remainderMs }
    });
    return {
      snapshot: next,
      elapsedSystemTimeMs: rawElapsedMs,
      simulatedElapsedMs: 0,
      capped,
      stateChanged: cleared.changes.length > 0,
      changes: cleared.changes
    };
  }

  const initialPlots = snapshot.plots;
  const initialCrops = snapshot.crops;
  const water = config.water;
  const elapsedMinutes = simulatedDeltaMs / 60_000;
  const windowStartMs = snapshot.simulation.lastSystemTimeMs - snapshot.simulation.remainderMs;
  const airTemperature = snapshot.environment.airTemperatureTenths / 10;
  const lightUnits = snapshot.environment.lightUnits;

  const plots = new Array(initialPlots.length);
  const crops: Record<string, CropState> = { ...initialCrops };
  const changes: FarmChange[] = [...cleared.changes];
  let remainderChanged = false;

  for (let index = 0; index < initialPlots.length; index++) {
    const beforePlot = initialPlots[index];
    const beforeMoisture = beforePlot.soil.moistureUnits;
    const totalEvap = integrateSoilEvaporation(beforeMoisture, water, elapsedMinutes, approximateEvapScratch);
    const afterMoisture = totalEvap.endMoisture;

    plots[index] =
      afterMoisture === beforeMoisture
        ? beforePlot
        : { ...beforePlot, soil: { ...beforePlot.soil, moistureUnits: afterMoisture } };

    if (afterMoisture !== beforeMoisture) {
      changes.push({
        kind: "soil-moisture-changed",
        plotId: beforePlot.plotId,
        previousMoistureUnits: beforeMoisture,
        moistureUnits: afterMoisture
      });
    }

    const occupantId = beforePlot.occupantId;
    if (!occupantId) continue;
    const beforeCrop = initialCrops[occupantId];
    if (!beforeCrop) continue;
    const crop = lookupCrop(definitions, beforeCrop.cropId);
    if (!crop) continue;

    let nextGrowthUnits = beforeCrop.growthUnits;
    let nextRemainderPermille = beforeCrop.growthRemainderPermille;

    if (
      beforePlot.ground.availability === "available" &&
      beforeCrop.healthPermille > 0 &&
      !isCropMature(crop, beforeCrop.growthUnits) &&
      config.cropGrowthMultiplier > 0
    ) {
      let eligibleSteps = stepCount;
      let averageMoisture = totalEvap.averageMoisture;
      const resumedAt = beforePlot.ground.resumedAtSystemTimeMs;
      if (resumedAt !== undefined && resumedAt > windowStartMs) {
        const skippedSteps = Math.min(stepCount, Math.ceil((resumedAt - windowStartMs) / stepMs));
        eligibleSteps = stepCount - skippedSteps;
        if (eligibleSteps > 0 && skippedSteps > 0) {
          const preEvap = integrateSoilEvaporation(
            beforeMoisture,
            water,
            (skippedSteps * stepMs) / 60_000,
            approximatePreEvapScratch
          );
          const eligibleEvap = integrateSoilEvaporation(
            preEvap.endMoisture,
            water,
            (eligibleSteps * stepMs) / 60_000,
            approximatePreEvapScratch
          );
          averageMoisture = eligibleEvap.averageMoisture;
        }
      }

      if (eligibleSteps > 0) {
        const eligibleSeconds = (eligibleSteps * stepMs) / 1_000;
        const factors = crop.growthFactors;
        const envCoeff = Math.min(
          evaluateTrapezoid(factors.airTemperature, airTemperature),
          evaluateTrapezoid(factors.light, lightUnits),
          evaluateTrapezoid(factors.soilPh, beforePlot.soil.phTenths / 10),
          evaluateTrapezoid(factors.pestPressure, beforeCrop.pestPressureUnits)
        );
        const waterCoeff = evaluateSoilMoistureGrowth(averageMoisture, water.minimumMoisture, water.capacity);
        const multiplier = combineGrowthCoefficients(waterCoeff, envCoeff);
        if (multiplier > 0) {
          const remainingUnits = crop.cycle.growthTarget - beforeCrop.growthUnits;
          const growthPerSecond =
            (crop.cycle.baseGrowthUnitsPerSecond * multiplier * config.cropGrowthMultiplier) / 1_000;
          if (eligibleSeconds * growthPerSecond + beforeCrop.growthRemainderPermille / 1_000 >= remainingUnits) {
            nextGrowthUnits = crop.cycle.growthTarget;
            nextRemainderPermille = 0;
          } else {
            const numerator =
              beforeCrop.growthRemainderPermille +
              Math.round(
                crop.cycle.baseGrowthUnitsPerSecond * eligibleSeconds * multiplier * config.cropGrowthMultiplier
              );
            const growthDelta = Math.floor(numerator / 1_000);
            nextGrowthUnits = Math.min(crop.cycle.growthTarget, beforeCrop.growthUnits + growthDelta);
            nextRemainderPermille = nextGrowthUnits >= crop.cycle.growthTarget ? 0 : numerator % 1_000;
          }
        }
      }
    }

    if (nextRemainderPermille !== beforeCrop.growthRemainderPermille) remainderChanged = true;

    crops[occupantId] = {
      ...beforeCrop,
      growthUnits: nextGrowthUnits,
      growthRemainderPermille: nextRemainderPermille,
      lastEvaluatedSimulationMs: simulatedTimeMs
    };

    if (nextGrowthUnits !== beforeCrop.growthUnits) {
      changes.push({
        kind: "crop-growth-applied",
        plotId: beforePlot.plotId,
        cropId: beforeCrop.cropId,
        cropInstanceId: beforeCrop.instanceId,
        previousGrowthUnits: beforeCrop.growthUnits,
        growthUnits: nextGrowthUnits
      });
      let previousStage = resolveCropStage(crop, beforeCrop.growthUnits);
      const stages = crop.cycle.stages;
      const beforeProgress = beforeCrop.growthUnits / crop.cycle.growthTarget;
      const afterProgress = nextGrowthUnits / crop.cycle.growthTarget;
      for (let s = 0; s < stages.length; s++) {
        const stage = stages[s];
        if (stage.minimumProgress <= beforeProgress || stage.minimumProgress > afterProgress) continue;
        changes.push({
          kind: "crop-stage-changed",
          plotId: beforePlot.plotId,
          cropId: beforeCrop.cropId,
          cropInstanceId: beforeCrop.instanceId,
          previousStageId: previousStage.id,
          stageId: stage.id
        });
        previousStage = stage;
      }
      if (!isCropMature(crop, beforeCrop.growthUnits) && isCropMature(crop, nextGrowthUnits)) {
        changes.push({
          kind: "crop-matured",
          plotId: beforePlot.plotId,
          cropId: beforeCrop.cropId,
          cropInstanceId: beforeCrop.instanceId
        });
      }
    }
  }

  const stateChanged = changes.length > 0 || remainderChanged;
  changes.push({
    kind: "simulation-advanced",
    previousSimulationTimeMs,
    simulatedTimeMs,
    elapsedSystemTimeMs: effectiveElapsedMs,
    capped
  });

  const next = freezeSnapshot({
    ...snapshot,
    simulation: { ...snapshot.simulation, lastSystemTimeMs: targetSystemTimeMs, simulatedTimeMs, remainderMs },
    plots,
    crops
  });
  return {
    snapshot: next,
    elapsedSystemTimeMs: rawElapsedMs,
    simulatedElapsedMs: simulatedDeltaMs,
    capped,
    stateChanged,
    changes: Object.freeze(changes)
  };
}
