import { freezeSnapshot, type FarmSnapshot, type PlotState } from "../FarmState";
import type { FarmChange, DamageCropCommand } from "../FarmCommands";
import { clamp } from "../validationUtils";
import { rejectRule, resolveCommandCrop, updateRule, type FarmRuleContext, type FarmRuleResult } from "./FarmRule";

export function applyCropDamage(context: FarmRuleContext, command: DamageCropCommand): FarmRuleResult {
  const target = resolveCommandCrop(context, command);
  if (!target.ok) return target;
  if (!Number.isInteger(command.damagePermille) || command.damagePermille <= 0)
    return rejectRule("INVALID_COMMAND", "作物伤害必须是正整数");
  if (
    command.pestPressureDeltaUnits !== undefined &&
    (!Number.isInteger(command.pestPressureDeltaUnits) || Math.abs(command.pestPressureDeltaUnits) > 100)
  )
    return rejectRule("INVALID_COMMAND", "病虫压力变化必须在 -100 到 100 之间");
  const { cropState, crop } = target;
  const previousHealthPermille = cropState.healthPermille;
  const healthPermille = Math.max(0, previousHealthPermille - command.damagePermille);
  const pestPressureUnits = clamp(cropState.pestPressureUnits + (command.pestPressureDeltaUnits ?? 0), 0, 100);
  const damaged = {
    ...context.snapshot,
    crops: { ...context.snapshot.crops, [cropState.instanceId]: { ...cropState, healthPermille, pestPressureUnits } }
  };
  const cleared = healthPermille === 0 ? clearDestroyedCrops(damaged) : { snapshot: damaged, changes: [] };
  return updateRule(
    context.snapshot,
    [
      {
        kind: "crop-health-changed",
        plotId: context.plot.plotId,
        cropId: crop.id,
        cropInstanceId: cropState.instanceId,
        source: command.source,
        previousHealthPermille,
        healthPermille
      },
      ...cleared.changes
    ],
    {
      crops: cleared.snapshot.crops,
      plots: cleared.snapshot.plots
    }
  );
}

/** Also clears zero-health crops in saves written before automatic removal was enabled. */
export function clearDestroyedCrops(snapshot: FarmSnapshot): { snapshot: FarmSnapshot; changes: FarmChange[] } {
  let plots: PlotState[] | undefined;
  let crops: Record<string, FarmSnapshot["crops"][string]> | undefined;
  const changes: FarmChange[] = [];
  for (let index = 0; index < snapshot.plots.length; index++) {
    const plot = snapshot.plots[index];
    const crop = plot.occupantId ? snapshot.crops[plot.occupantId] : undefined;
    if (!crop || crop.healthPermille > 0) continue;
    crops ??= { ...snapshot.crops };
    delete crops[crop.instanceId];
    plots ??= snapshot.plots.slice();
    plots[index] = {
      ...plot,
      occupantId: null,
      soil: { ...plot.soil, preparation: "leveled" }
    };
    changes.push(
      {
        kind: "crop-removed",
        reason: "destroyed",
        plotId: plot.plotId,
        cropId: crop.cropId,
        cropInstanceId: crop.instanceId
      },
      { kind: "plot-updated", plotId: plot.plotId }
    );
  }
  return { snapshot: crops ? freezeSnapshot({ ...snapshot, crops, plots: plots! }) : snapshot, changes };
}
