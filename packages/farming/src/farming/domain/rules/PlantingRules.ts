import type { PlantCommand } from "../FarmCommands";
import type { CropState, PlotState } from "../FarmState";
import { DEFAULT_PLANT_SHAPE } from "../../procedural/core/PlantGrowthRecipe";
import { requireStableId } from "../validationUtils";
import { getCrop, getCropState } from "./CropGrowthRules";
import { rejectRule, replacePlot, updateRule, type FarmRuleContext, type FarmRuleResult } from "./FarmRule";

export function plantingBlockReason(plot: PlotState, crop: CropState | null): "untilled" | "occupied" | undefined {
  if (plot.soil.preparation !== "leveled") return "untilled";
  if (crop) return "occupied";
}

export function applyPlanting(context: FarmRuleContext, command: PlantCommand): FarmRuleResult {
  const { snapshot, plot, plotIndex, definitions } = context;
  const blocked = plantingBlockReason(plot, getCropState(snapshot, plot));
  if (blocked === "untilled") return rejectRule("PLOT_NOT_TILLED", "土地尚未整备");
  if (blocked === "occupied") return rejectRule("PLOT_OCCUPIED", "土地已经种植作物");
  const seed = definitions.seeds.find((candidate) => candidate.id === command.seedId);
  const crop = seed && getCrop(definitions, seed.cropId);
  if (!seed || !crop) return rejectRule("INVALID_DEFINITION", "种子没有有效的作物定义");
  const plantedOrder = snapshot.plantingSequence + 1;
  let instanceId: string;
  try {
    instanceId = context.createCropInstanceId();
    requireStableId(instanceId, "crop instance");
  } catch {
    return rejectRule("INVALID_COMMAND", "宿主未提供有效的作物实例 ID");
  }
  if (Object.hasOwn(snapshot.crops, instanceId))
    return rejectRule("INVALID_COMMAND", "作物实例 ID 已存在，不能覆盖现有作物");
  const cropState: CropState = {
    instanceId,
    cropId: crop.id,
    cropDefinitionVersion: crop.version,
    cycleId: crop.cycle.id,
    cycleRevision: crop.cycle.revision,
    plantDefinitionId: crop.appearance.plantId,
    plantDefinitionRevision: crop.appearance.plantRevision,
    recipeRevision: crop.appearance.recipeRevision,
    shape: { ...DEFAULT_PLANT_SHAPE },
    anchorPlotId: plot.plotId,
    plantedOrder,
    plantedAtSimulationMs: snapshot.simulation.simulatedTimeMs,
    lastEvaluatedSimulationMs: snapshot.simulation.simulatedTimeMs,
    growthUnits: 0,
    growthRemainderPermille: 0,
    healthPermille: 1_000,
    pestPressureUnits: 0
  };
  return updateRule(
    snapshot,
    [{ kind: "crop-planted", plotId: plot.plotId, cropId: crop.id, cropInstanceId: instanceId, growthUnits: 0 }],
    {
      plantingSequence: plantedOrder,
      plots: replacePlot(snapshot.plots, plotIndex, { ...plot, occupantId: instanceId }),
      crops: { ...snapshot.crops, [instanceId]: cropState }
    }
  );
}
