import type { HarvestCommand } from "../FarmCommands";
import type { CropDefinition } from "../FarmDefinitions";
import type { CropState } from "../FarmState";
import { calculateHarvestQuantity } from "../GrowthFactors";
import { carriedItem, basketUsed, HARVEST_BASKET_CAPACITY } from "../FarmItems";
import { isCropMature } from "./CropGrowthRules";
import {
  rejectRule,
  replacePlot,
  resolveCommandCrop,
  updateRule,
  type FarmRuleContext,
  type FarmRuleResult
} from "./FarmRule";

export function harvestBlockReason(
  crop: CropDefinition | undefined,
  state: CropState | null
): "empty" | "immature" | undefined {
  if (!state || !crop) return "empty";
  if (!isCropMature(crop, state.growthUnits)) return "immature";
}

export function applyHarvest(context: FarmRuleContext, command: HarvestCommand): FarmRuleResult {
  const target = resolveCommandCrop(context, command);
  if (!target.ok) return target;
  const { crop, cropState } = target;
  if (harvestBlockReason(crop, cropState)) return rejectRule("CROP_NOT_MATURE", "作物尚未成熟");
  const { snapshot, plot, plotIndex } = context;
  const harvestedQuantity = calculateHarvestQuantity(crop.harvest.quantity, cropState.healthPermille);
  const basket = carriedItem(snapshot.items);
  if (!basket || basket.type !== "harvest-basket") return rejectRule("TOOL_REQUIRED", "请先携带收获篮子");
  const used = basketUsed(basket);
  if (used + harvestedQuantity > HARVEST_BASKET_CAPACITY)
    return {
      ok: false,
      code: "BASKET_CAPACITY_INSUFFICIENT",
      message: `收获篮子空间不足：容量 ${HARVEST_BASKET_CAPACITY}，已用 ${used}，本次需要 ${harvestedQuantity}`,
      details: { capacity: HARVEST_BASKET_CAPACITY, used, required: harvestedQuantity }
    };
  const contents = basket.contents.map((entry) => ({ ...entry }));
  if (harvestedQuantity) {
    const existing = contents.find((entry) => entry.cropId === crop.id);
    if (existing) existing.quantity += harvestedQuantity;
    else contents.push({ cropId: crop.id, itemId: crop.harvest.itemId, quantity: harvestedQuantity });
  }
  const items = {
    ...snapshot.items,
    instances: snapshot.items.instances.map((item) => (item.id === basket.id ? { ...item, contents } : item))
  };
  const crops = { ...snapshot.crops };
  delete crops[cropState.instanceId];
  return updateRule(
    snapshot,
    [
      {
        kind: "crop-harvested",
        plotId: plot.plotId,
        cropId: crop.id,
        cropInstanceId: cropState.instanceId,
        itemId: crop.harvest.itemId,
        quantity: harvestedQuantity
      },
      { kind: "basket-content-changed", itemId: basket.id }
    ],
    {
      plots: replacePlot(snapshot.plots, plotIndex, { ...plot, occupantId: null }),
      crops,
      items
    }
  );
}
