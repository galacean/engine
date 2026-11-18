import { resolveSimulationConfig } from "../../config/FarmingSimulationConfig";
import { buildWaterGraph } from "../fields/SoilWaterField";
import { distributeFieldInput } from "../fields/SpatialField";
import type { FarmChange } from "../FarmCommands";
import type { FarmingDefinitionSet } from "../FarmDefinitions";
import type { FarmSnapshot, PlotState } from "../FarmState";
import { getCropState } from "./CropGrowthRules";
import { rejectRule, updateRule, type FarmRuleContext, type FarmRuleResult } from "./FarmRule";

export function irrigationBlockReason(
  snapshot: FarmSnapshot,
  definitions: FarmingDefinitionSet,
  plot: PlotState
): "empty" | undefined {
  const cropState = getCropState(snapshot, plot);
  if (!cropState && !definitions.actionPolicy.allowIrrigateEmptyPlot) return "empty";
}

export function applyIrrigation({ snapshot, definitions, plot, simulationConfig }: FarmRuleContext): FarmRuleResult {
  if (irrigationBlockReason(snapshot, definitions, plot) === "empty")
    return rejectRule("ACTION_UNAVAILABLE", "请先播种再浇水");
  const config = simulationConfig ?? resolveSimulationConfig(definitions.soilProfile);
  const graph = buildWaterGraph(snapshot, config);
  const values = Float64Array.from(graph.plotIndices, (i) => snapshot.plots[i].soil.moistureUnits);
  const origin = graph.nodes.findIndex((node) => node.id === plot.plotId);
  const water = distributeFieldInput(graph, values, origin, config.water.wateringAmount);
  const changes: FarmChange[] = [
    {
      kind: "soil-irrigated",
      plotId: plot.plotId,
      previousMoistureUnits: plot.soil.moistureUnits,
      moistureUnits: values[origin],
      water
    }
  ];
  const plots = [...snapshot.plots];
  graph.plotIndices.forEach((index, i) => {
    const before = plots[index];
    if (before.soil.moistureUnits === values[i]) return;
    plots[index] = {
      ...before,
      soil: { ...before.soil, moistureUnits: values[i], lastIrrigatedSimulationMs: snapshot.simulation.simulatedTimeMs }
    };
    changes.push({
      kind: "soil-moisture-changed",
      plotId: before.plotId,
      previousMoistureUnits: before.soil.moistureUnits,
      moistureUnits: values[i]
    });
  });
  return updateRule(snapshot, changes, { plots });
}
