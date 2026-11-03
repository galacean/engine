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
import { settleSoilMoisture } from "./SoilMoisture";
import type { FarmChange } from "./FarmCommands";
import type { FarmingDefinitionSet } from "./FarmDefinitions";
import type { CropState, FarmSnapshot } from "./FarmState";
import { freezeSnapshot } from "./FarmState";
import { getCrop, isCropMature, resolveCropStage, resolveGrowthCoefficient } from "./rules/CropGrowthRules";
import { requirePositiveInteger, requireSystemTime } from "./validationUtils";

export const FARM_SIMULATION_STEP_MS = FARMING_SIMULATION_CONFIG.stepMs;
export const FARM_MAX_CATCH_UP_MS = FARMING_SIMULATION_CONFIG.maximumCatchUpMs;

export interface FarmTimeAdvanceSummary {
  readonly elapsedSystemTimeMs: number;
  readonly simulatedElapsedMs: number;
  readonly capped: boolean;
  readonly changes: readonly FarmChange[];
}

export interface SettleFarmTimeResult extends FarmTimeAdvanceSummary {
  readonly snapshot: FarmSnapshot;
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
      changes: cleared.changes
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
    changes: Object.freeze(changes)
  };
}
