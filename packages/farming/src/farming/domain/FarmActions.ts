import { calculateHarvestQuantity } from "./GrowthFactors";
import { carriedItem, basketUsed, HARVEST_BASKET_CAPACITY } from "./FarmItems";
import { isGroundTarget, GROUND_REASON_MESSAGES } from "./FarmingGround";
import type {
  FarmCommandBase,
  HarvestCommand,
  IrrigateCommand,
  PlantCommand,
  HoeCommand,
  DeletePlotCommand
} from "./FarmCommands";
import type { FarmingDefinitionSet } from "./FarmDefinitions";
import type { FarmSnapshot, PlotState } from "./FarmState";
import { getCrop, getCropState } from "./rules/CropGrowthRules";
import { harvestBlockReason } from "./rules/HarvestRules";
import { irrigationBlockReason } from "./rules/IrrigationRules";
import { plantingBlockReason } from "./rules/PlantingRules";

/** Player tool operations. Damage uses a separate public write path; time advancement is test-only. */
export type FarmActionCommand = PlantCommand | IrrigateCommand | HarvestCommand | HoeCommand | DeletePlotCommand;
export type FarmActionId = FarmActionCommand["type"];
type ActionInput<T> = T extends FarmActionCommand ? Omit<T, keyof FarmCommandBase> : never;
export type FarmActionInput = ActionInput<FarmActionCommand>;

export interface FarmActionOptions {
  /** Retry with both the original ID and revision, together with the unchanged input. */
  readonly commandId?: string;
  readonly expectedRevision?: number;
  readonly expectedGroundRevision?: number;
  readonly expectedCarriedItemId?: string;
}

export interface FarmActionDefinition {
  readonly id: FarmActionId;
  readonly name: string;
  readonly description: string;
}

export interface BaseActionAvailability {
  readonly enabled: boolean;
  readonly reason?: string;
}

export interface ActionAvailability extends BaseActionAvailability {
  readonly action: FarmActionId;
}

interface ActionEntry extends FarmActionDefinition {
  readonly blockReason: (
    snapshot: FarmSnapshot,
    definitions: FarmingDefinitionSet,
    plot: PlotState
  ) => string | undefined;
  readonly validInput: (input: FarmActionInput) => boolean;
}

/** The shared catalog owns operation names, documentation and rule-backed availability. */
const actions = {
  plant: {
    id: "plant",
    name: "播种",
    description: "在已整备的空地播种指定种子，创建一个作物实例。",
    blockReason(snapshot, _definitions, plot) {
      const crop = getCropState(snapshot, plot);
      const blocked = plantingBlockReason(plot, crop);
      return crop ? "土地已种植" : blocked === "untilled" ? "土地尚未整备" : undefined;
    },
    validInput: (input) => input.type === "plant" && nonEmptyString(input.seedId)
  },
  irrigate: {
    id: "irrigate",
    name: "浇水",
    description:
      "浇水增加体积含水率；目标饱和后余水分配到连通耕地，全部饱和后流失。空地是否可浇水由配置决定，不使作物立即成熟。",
    blockReason(snapshot, definitions, plot) {
      const blocked = irrigationBlockReason(snapshot, definitions, plot);
      return blocked === "empty" ? "请先播种" : undefined;
    },
    validInput: (input) => input.type === "irrigate"
  },
  hoe: {
    id: "hoe",
    name: "锄地",
    description: "将符合条件的地形直接开垦为已整平耕地，或清理已有耕地；已有作物会被铲除，不产生收获物。",
    blockReason() {
      return undefined;
    },
    validInput: (input) =>
      input.type === "hoe" &&
      isGroundTarget(input.target) &&
      (input.expectedCropInstanceId === undefined ||
        input.expectedCropInstanceId === null ||
        nonEmptyString(input.expectedCropInstanceId))
  },
  "delete-plot": {
    id: "delete-plot",
    name: "还原",
    description: "删除耕地记录并露出宿主原地形，不修改地形；有作物时须显式指定 cascadeCrop，一并移除且不产生收获物。",
    blockReason() {
      return undefined;
    },
    validInput: (input) =>
      input.type === "delete-plot" && (input.cascadeCrop === undefined || typeof input.cascadeCrop === "boolean")
  },
  harvest: {
    id: "harvest",
    name: "收获",
    description: "收获指定的成熟作物实例，将整次实际产出放入当前收获篮子并腾空土地；篮子容量 20，空间不足整次拒绝。",
    blockReason(snapshot, definitions, plot) {
      const crop = getCropState(snapshot, plot);
      const blocked = harvestBlockReason(crop ? getCrop(definitions, crop.cropId) : undefined, crop);
      if (blocked) return blocked === "empty" ? "没有作物" : "尚未成熟";
      const basket = carriedItem(snapshot.items);
      if (!basket || basket.type !== "harvest-basket") return undefined;
      const cropDefinition = crop && getCrop(definitions, crop.cropId);
      const required =
        cropDefinition && crop ? calculateHarvestQuantity(cropDefinition.harvest.quantity, crop.healthPermille) : 0;
      return basketUsed(basket) + required > HARVEST_BASKET_CAPACITY ? "收获篮子空间不足" : undefined;
    },
    validInput: (input) => input.type === "harvest" && nonEmptyString(input.cropInstanceId)
  }
} satisfies { readonly [Id in FarmActionId]: ActionEntry & { readonly id: Id } };

const orderedActions = [actions.plant, actions.irrigate, actions.harvest, actions.hoe, actions["delete-plot"]] as const;
const definitions: readonly FarmActionDefinition[] = Object.freeze(
  orderedActions.map(({ id, name, description }) => Object.freeze({ id, name, description }))
);

export function getActionDefinitions(): readonly FarmActionDefinition[] {
  return definitions;
}

/** Availability is a snapshot preview; execution always rechecks the rules after settling time. */
export function getActionAvailability(
  snapshot: FarmSnapshot,
  definitions: FarmingDefinitionSet,
  plotId: string
): readonly ActionAvailability[] {
  const plot = snapshot.plots.find((candidate) => candidate.plotId === plotId);
  return orderedActions.map((action) => {
    const groundBlocked =
      plot &&
      action.id !== "delete-plot" &&
      (plot.ground.availability === "unloaded" ||
        (["plant", "hoe"].includes(action.id) && plot.ground.availability !== "available"));
    const reason = groundBlocked
      ? GROUND_REASON_MESSAGES[plot!.ground.reason!]
      : plot
        ? action.blockReason(snapshot, definitions, plot)
        : "土地不存在";
    return { action: action.id, enabled: !reason, reason };
  });
}

/** Also guard untyped JS callers without making UI availability an execution gate. */
export function isFarmActionInput(input: unknown): input is FarmActionInput {
  if (!input || typeof input !== "object") return false;
  const value = input as FarmActionInput;
  return (
    Object.prototype.hasOwnProperty.call(actions, value.type) &&
    (value.type === "hoe" ? isGroundTarget(value.target) : "plotId" in value && nonEmptyString(value.plotId)) &&
    actions[value.type].validInput(value)
  );
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
