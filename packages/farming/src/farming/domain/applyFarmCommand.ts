import { applyFarmItem, isItemCommand } from "./rules/FarmItemRules";
import { applyStorageWrite } from "../storage/StorageRules";
import { refreshWaterGround } from "./fields/SoilWaterField";
import { isFarmCommand } from "./FarmCommandValidation";
import { applyPlotManagement } from "./rules/PlotManagementRules";
import { GROUND_REASON_MESSAGES } from "./FarmingGround";
import { commandSignature } from "./CommandReceipts";
import {
  FARM_RECEIPT_LIMIT,
  type ApplyFarmCommandContext,
  type ApplyFarmCommandResult,
  type FarmChange,
  type FarmCommand,
  type FarmCommandReceipt,
  type FarmingErrorCode
} from "./FarmCommands";
import type { FarmingDefinitionSet } from "./FarmDefinitions";
import { settleFarmTime, type SettleFarmTimeResult } from "./FarmSimulation";
import type { FarmSnapshot } from "./FarmState";
import { freezeSnapshot } from "./FarmState";
import { applyCropDamage } from "./rules/CropDamageRules";
import type { FarmRuleContext, FarmRuleResult } from "./rules/FarmRule";
import { applyHarvest } from "./rules/HarvestRules";
import { applyIrrigation } from "./rules/IrrigationRules";
import { applyPlanting } from "./rules/PlantingRules";

export function applyFarmCommand(
  snapshot: FarmSnapshot,
  command: FarmCommand,
  definitions: FarmingDefinitionSet,
  context: ApplyFarmCommandContext
): ApplyFarmCommandResult {
  if (!isFarmCommand(command)) return failure(snapshot, command, "INVALID_COMMAND", "操作或参数无效");
  const signature = commandSignature(command);
  const previousReceipt = snapshot.recentReceipts.find((receipt) => receipt.commandId === command.commandId);
  if (previousReceipt) {
    if (previousReceipt.signature !== signature)
      return failure(snapshot, command, "INVALID_COMMAND", "命令 ID 已用于其他操作");
    return {
      snapshot,
      result: {
        ok: true,
        commandId: command.commandId,
        revision: snapshot.revision,
        replayed: true,
        changes: previousReceipt.changes
      }
    };
  }
  if (command.farmId !== snapshot.farmId) return failure(snapshot, command, "FARM_MISMATCH", "命令不属于当前农场");
  if (command.expectedRevision !== snapshot.revision) {
    return failure(snapshot, command, "VERSION_CONFLICT", "农场状态已更新，请重试本次操作");
  }
  if (command.expectedCarriedItemId !== undefined) {
    const carry = snapshot.items.carried;
    const id = carry && carry.itemId;
    if (id !== command.expectedCarriedItemId)
      return failure(snapshot, command, "ITEM_CHANGED", "携带物已变化，请重新操作");
  }
  if (!command.commandId.trim()) return failure(snapshot, command, "INVALID_COMMAND", "命令 ID 不能为空");

  if (command.type === "advance-time") {
    const settled = settleFarmTime(snapshot, command.targetSystemTimeMs, definitions, context);
    if (settled.snapshot === snapshot) return successWithoutCommit(snapshot, command);
    const next = freezeSnapshot({ ...settled.snapshot, revision: snapshot.revision + 1 });
    return {
      snapshot: next,
      result: {
        ok: true,
        commandId: command.commandId,
        revision: next.revision,
        replayed: false,
        changes: settled.changes
      }
    };
  }

  if (command.type === "damage-crop") {
    if (command.expectedGroundRevision !== undefined && command.expectedGroundRevision !== context.groundView?.revision)
      return failure(snapshot, command, "GROUND_CHANGED", "地形已变化，请重试");
    const plotIndex = snapshot.plots.findIndex((p) => p.plotId === command.plotId);
    if (plotIndex < 0) return failure(snapshot, command, "PLOT_NOT_FOUND", "土地不存在");
    const checked = applyCropDamage(
      {
        snapshot,
        definitions,
        plot: snapshot.plots[plotIndex],
        plotIndex,
        createCropInstanceId: context.createCropInstanceId
      },
      command
    );
    if (!checked.ok) return failure(snapshot, command, checked.code, checked.message);
  }

  const targetTime = context.targetSystemTimeMs ?? snapshot.simulation.lastSystemTimeMs;
  const settled = settleFarmTime(snapshot, targetTime, definitions, context);
  const working = settled.snapshot;
  if (command.type === "consume-basket") {
    if (command.expectedGroundRevision !== undefined && command.expectedGroundRevision !== context.groundView?.revision)
      return failureAfterSettlement(snapshot, settled, command, "GROUND_CHANGED", "地形已变化，请重试");
    const basket = working.items.instances.find((item) => item.id === command.basketId);
    if (!basket || basket.type !== "harvest-basket")
      return failureAfterSettlement(snapshot, settled, command, "ITEM_NOT_FOUND", "收获篮子不存在");
    if (working.items.carried?.itemId === basket.id)
      return failureAfterSettlement(snapshot, settled, command, "ITEM_CHANGED", "携带中的篮子不能被取食");
    const entry = basket.contents.find(
      (content) => content.cropId === command.cropId && content.itemId === command.itemId
    );
    if (!entry || entry.quantity < command.quantity)
      return failureAfterSettlement(snapshot, settled, command, "INSUFFICIENT_INVENTORY", "指定篮中果实不足");
    const contents = basket.contents
      .map((content) => (content === entry ? { ...content, quantity: content.quantity - command.quantity } : content))
      .filter((content) => content.quantity > 0);
    return commitCommand(
      {
        ...working,
        items: {
          ...working.items,
          instances: working.items.instances.map((item) => (item.id === basket.id ? { ...item, contents } : item))
        }
      },
      command,
      signature,
      [...settled.changes, { kind: "basket-content-changed", itemId: basket.id }]
    );
  }
  if (isItemCommand(command)) {
    if (command.expectedGroundRevision !== undefined && command.expectedGroundRevision !== context.groundView?.revision)
      return failure(snapshot, command, "GROUND_CHANGED", "地形已变化，请重试");
    const applied = applyFarmItem(working, command, definitions, context.groundView);
    if (!applied.ok) return failure(snapshot, command, applied.code, applied.message);
    return commitCommand({ ...working, ...applied.state }, command, signature, [
      ...settled.changes,
      ...applied.changes
    ]);
  }
  if (command.type === "set-container-count" || command.type === "withdraw-inventory") {
    if (command.expectedGroundRevision !== undefined && command.expectedGroundRevision !== context.groundView?.revision)
      return failureAfterSettlement(snapshot, settled, command, "GROUND_CHANGED", "地形已变化，请重试");
    const applied = applyStorageWrite(working, definitions, command, context.groundView);
    if (!applied.ok) return failureAfterSettlement(snapshot, settled, command, applied.code, applied.message);
    return commitCommand({ ...working, storage: applied.storage }, command, signature, [
      ...settled.changes,
      ...applied.changes
    ]);
  }
  if (["create-plot", "hoe", "update-plot", "delete-plot"].includes(command.type)) {
    const applied = applyPlotManagement(
      working,
      command as import("./FarmCommands").PlotManagementCommand,
      definitions,
      context
    );
    if (!applied.ok) return failureAfterSettlement(snapshot, settled, command, applied.code, applied.message);
    const managed = { ...working, ...applied.state };
    const connected = context.groundView
      ? refreshWaterGround(managed, context.groundView, targetTime)
      : { snapshot: managed, changes: [] };
    return commitCommand(connected.snapshot, command, signature, [
      ...settled.changes,
      ...applied.changes,
      ...connected.changes
    ]);
  }
  if (!("plotId" in command))
    return failureAfterSettlement(snapshot, settled, command, "INVALID_COMMAND", "操作参数无效");
  const plotIndex = working.plots.findIndex((plot) => plot.plotId === command.plotId);
  if (plotIndex < 0) return failureAfterSettlement(snapshot, settled, command, "PLOT_NOT_FOUND", "土地不存在");
  const plot = working.plots[plotIndex];
  if (
    command.type === "harvest" &&
    command.expectedGroundRevision !== undefined &&
    command.expectedGroundRevision !== context.groundView?.revision
  )
    return failureAfterSettlement(snapshot, settled, command, "GROUND_CHANGED", "作业期间地形已变化，请重试");
  if (
    command.type !== "damage-crop" &&
    (plot.ground.availability === "unloaded" || (command.type === "plant" && plot.ground.availability !== "available"))
  ) {
    return failureAfterSettlement(
      snapshot,
      settled,
      command,
      plot.ground.reason!,
      GROUND_REASON_MESSAGES[plot.ground.reason!]
    );
  }

  const ruleContext: FarmRuleContext = {
    groundView: context.groundView,
    simulationConfig: context.simulationConfig,
    snapshot: working,
    definitions,
    plot,
    plotIndex,
    createCropInstanceId: context.createCropInstanceId
  };
  let applied: FarmRuleResult;
  switch (command.type) {
    case "plant":
      applied = applyPlanting(ruleContext, command);
      break;
    case "irrigate":
      applied = applyIrrigation(ruleContext);
      break;
    case "harvest":
      applied = applyHarvest(ruleContext, command);
      break;
    case "damage-crop":
      applied = applyCropDamage(ruleContext, command);
      break;
    default:
      return failureAfterSettlement(snapshot, settled, command, "INVALID_COMMAND", "操作参数无效");
  }
  if (!applied.ok) {
    const failed = failureAfterSettlement(snapshot, settled, command, applied.code, applied.message);
    return applied.details
      ? {
          ...failed,
          result: { ...failed.result, error: { code: applied.code, message: applied.message, ...applied.details } }
        }
      : failed;
  }
  // Merge rule state once; commitCommand owns the revision and receipt.
  return commitCommand({ ...working, ...applied.state }, command, signature, [...settled.changes, ...applied.changes]);
}

function commitCommand(
  snapshot: FarmSnapshot,
  command: Exclude<FarmCommand, { readonly type: "advance-time" }>,
  signature: string,
  changes: readonly FarmChange[]
): ApplyFarmCommandResult {
  const revision = snapshot.revision + 1;
  const receipt: FarmCommandReceipt = {
    commandId: command.commandId,
    signature,
    committedRevision: revision,
    changes: Object.freeze([...changes])
  };
  const next = freezeSnapshot({
    ...snapshot,
    revision,
    recentReceipts: [...snapshot.recentReceipts, receipt].slice(-FARM_RECEIPT_LIMIT)
  });
  return {
    snapshot: next,
    result: { ok: true, commandId: command.commandId, revision, replayed: false, changes: receipt.changes }
  };
}

function failureAfterSettlement(
  original: FarmSnapshot,
  settled: SettleFarmTimeResult,
  command: FarmCommand,
  code: FarmingErrorCode,
  message: string
): ApplyFarmCommandResult {
  if (settled.snapshot === original) return failure(original, command, code, message);
  const next = freezeSnapshot({ ...settled.snapshot, revision: original.revision + 1 });
  return {
    snapshot: next,
    result: {
      ok: false,
      commandId: command.commandId,
      revision: next.revision,
      replayed: false,
      changes: settled.changes,
      error: { code, message }
    }
  };
}

function successWithoutCommit(snapshot: FarmSnapshot, command: FarmCommand): ApplyFarmCommandResult {
  return {
    snapshot,
    result: { ok: true, commandId: command.commandId, revision: snapshot.revision, replayed: false, changes: [] }
  };
}

function failure(
  snapshot: FarmSnapshot,
  command: FarmCommand,
  code: FarmingErrorCode,
  message: string
): ApplyFarmCommandResult {
  return {
    snapshot,
    result: {
      ok: false,
      commandId: command.commandId,
      revision: snapshot.revision,
      replayed: false,
      changes: [],
      error: { code, message }
    }
  };
}
