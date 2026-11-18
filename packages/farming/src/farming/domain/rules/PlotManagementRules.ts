import { storageBlocksCultivation } from "../../storage/StorageRules";
import type { FarmingDefinitionSet } from "../FarmDefinitions";
import type { ApplyFarmCommandContext, PlotManagementCommand } from "../FarmCommands";
import {
  GROUND_REASON_MESSAGES,
  groundState,
  inspectGround,
  isGroundTarget,
  plotIdForTarget,
  shapeSeedForId
} from "../FarmingGround";
import type { FarmSnapshot, PlotState } from "../FarmState";
import { rejectRule, updateRule, type FarmRuleResult } from "./FarmRule";

/** CRUD and player tools share this rule; callers cannot supply their own ground evidence. */
export function applyPlotManagement(
  snapshot: FarmSnapshot,
  command: PlotManagementCommand,
  definitions: FarmingDefinitionSet,
  context: ApplyFarmCommandContext
): FarmRuleResult {
  const time = context.targetSystemTimeMs ?? snapshot.simulation.lastSystemTimeMs;
  let plot: PlotState | undefined;
  if (command.type === "create-plot" || command.type === "hoe") {
    if (!isGroundTarget(command.target)) return rejectRule("INVALID_COMMAND", "土地目标无效");
    plot = snapshot.plots.find(
      (p) =>
        p.groundId === command.target.groundId && p.cellX === command.target.cellX && p.cellZ === command.target.cellZ
    );
    if (plot && command.type === "create-plot") return rejectRule("PLOT_EXISTS", "耕地已存在");
    if (!plot && snapshot.plots.some((p) => p.plotId === plotIdForTarget(command.target)))
      return rejectRule("PLOT_EXISTS", "耕地 ID 已用于其他土地，不能创建重复身份");
  } else {
    plot = snapshot.plots.find((p) => p.plotId === command.plotId);
    if (!plot) return rejectRule("PLOT_NOT_FOUND", "土地不存在");
  }
  if (
    command.type === "hoe" &&
    command.expectedCropInstanceId !== undefined &&
    (plot?.occupantId ?? null) !== command.expectedCropInstanceId
  )
    return rejectRule("CROP_INSTANCE_CHANGED", "作物已变化，请重新确认锄地目标");
  if (command.type === "delete-plot") {
    if (command.cascadeCrop !== undefined && typeof command.cascadeCrop !== "boolean")
      return rejectRule("INVALID_COMMAND", "删除参数无效");
    if (plot!.occupantId && !command.cascadeCrop) return rejectRule("PLOT_OCCUPIED", "请先收获，或明确允许移除作物");
    const crops = { ...snapshot.crops };
    const crop = plot!.occupantId ? crops[plot!.occupantId] : undefined;
    if (crop) delete crops[crop.instanceId];
    return updateRule(
      snapshot,
      [
        ...(crop
          ? [
              {
                kind: "crop-removed" as const,
                plotId: plot!.plotId,
                cropId: crop.cropId,
                cropInstanceId: crop.instanceId
              }
            ]
          : []),
        { kind: "plot-deleted", plotId: plot!.plotId }
      ],
      { plots: snapshot.plots.filter((p) => p !== plot), crops }
    );
  }
  const patch =
    command.type === "update-plot"
      ? command.patch
      : command.type === "create-plot"
        ? { label: command.target.label, preparation: "leveled" as const }
        : { preparation: "leveled" as const };
  if (
    !patch ||
    typeof patch !== "object" ||
    Object.keys(patch).some((k) => k !== "label" && k !== "preparation") ||
    !Object.keys(patch).length ||
    (patch.label !== undefined &&
      (typeof patch.label !== "string" || !patch.label.trim() || patch.label.length > 80)) ||
    (patch.preparation !== undefined && patch.preparation !== "leveled")
  )
    return rejectRule("INVALID_COMMAND", "耕地修改参数无效");
  if (patch.preparation !== undefined && plot?.occupantId && command.type !== "hoe")
    return rejectRule("PLOT_OCCUPIED", "已有作物，请先收获或锄除，再修改准备状态");
  const target = command.type === "hoe" || command.type === "create-plot" ? command.target : plot!;
  if (!context.groundView) return rejectRule("GROUND_MISSING", "宿主没有提供地形");
  if (command.expectedGroundRevision !== undefined && command.expectedGroundRevision !== context.groundView.revision)
    return rejectRule("GROUND_CHANGED", "作业期间地形已变化，请重试");
  if (patch.preparation !== undefined && storageBlocksCultivation(snapshot, definitions, target))
    return rejectRule("GROUND_BLOCKED", "仓储容器及通道不能开垦");
  const inspection = inspectGround(context.groundView, snapshot.grid, target, plot?.plotId);
  if (patch.preparation !== undefined && inspection.reason)
    return rejectRule(inspection.reason, GROUND_REASON_MESSAGES[inspection.reason]);
  const removedCrop = command.type === "hoe" && plot?.occupantId ? snapshot.crops[plot.occupantId] : undefined;
  let crops = snapshot.crops;
  if (removedCrop) {
    const remaining = { ...crops };
    delete remaining[removedCrop.instanceId];
    crops = remaining;
  }
  const next: PlotState = plot
    ? {
        ...plot,
        occupantId: removedCrop ? null : plot.occupantId,
        label: patch.label?.trim() ?? plot.label,
        soil: { ...plot.soil, preparation: patch.preparation ?? plot.soil.preparation },
        ground: groundState(inspection, time, plot.ground)
      }
    : {
        groundId: target.groundId,
        cellX: target.cellX,
        cellZ: target.cellZ,
        plotId: plotIdForTarget(target),
        label: patch.label?.trim() ?? `田 ${target.cellX},${target.cellZ}`,
        shapeSeed: shapeSeedForId(plotIdForTarget(target)),
        occupantId: null,
        ground: groundState(inspection, time),
        soil: {
          preparation: "leveled",
          moistureUnits: definitions.soilProfile.initialMoistureUnits,
          lastIrrigatedSimulationMs: null,
          phTenths: definitions.soilProfile.initialPhTenths
        }
      };
  return updateRule(
    snapshot,
    [
      ...(removedCrop
        ? [
            {
              kind: "crop-removed" as const,
              reason: "hoe" as const,
              plotId: next.plotId,
              cropId: removedCrop.cropId,
              cropInstanceId: removedCrop.instanceId
            }
          ]
        : []),
      { kind: plot ? "plot-updated" : "plot-created", plotId: next.plotId }
    ],
    {
      crops,
      plots: plot ? snapshot.plots.map((p) => (p === plot ? next : p)) : [...snapshot.plots, next]
    }
  );
}
