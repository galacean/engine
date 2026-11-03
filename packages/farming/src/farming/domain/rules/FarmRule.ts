import type { DamageCropCommand, FarmChange, FarmingErrorCode, HarvestCommand } from "../FarmCommands";
import type { CropDefinition, FarmingDefinitionSet } from "../FarmDefinitions";
import type { CropState, FarmSnapshot, PlotState } from "../FarmState";
import { getCrop, getCropState } from "./CropGrowthRules";

/** Rules return state changes; only applyFarmCommand owns revisions and command receipts. */
export interface FarmRuleContext {
  readonly groundView?: import("../FarmingGround").FarmingGroundView;
  readonly simulationConfig?: import("../../config/FarmingSimulationConfig").FarmingSimulationConfig;
  readonly snapshot: FarmSnapshot;
  readonly definitions: FarmingDefinitionSet;
  readonly plot: PlotState;
  readonly plotIndex: number;
  readonly createCropInstanceId: () => string;
}

export interface FarmRuleFailure {
  readonly ok: false;
  readonly code: FarmingErrorCode;
  readonly message: string;
  readonly details?: { readonly capacity: number; readonly used: number; readonly required: number };
}

type FarmRuleState = Pick<FarmSnapshot, "plots" | "crops" | "storage" | "plantingSequence" | "items">;
export type FarmRuleResult =
  | FarmRuleFailure
  | {
      readonly ok: true;
      readonly state: FarmRuleState;
      readonly changes: readonly FarmChange[];
    };

export function rejectRule(code: FarmingErrorCode, message: string): FarmRuleFailure {
  return { ok: false, code, message };
}

export function updateRule(
  snapshot: FarmSnapshot,
  changes: readonly FarmChange[],
  patch: Partial<FarmRuleState>
): FarmRuleResult {
  return {
    ok: true,
    state: {
      plots: snapshot.plots,
      crops: snapshot.crops,
      storage: snapshot.storage,
      items: snapshot.items,
      plantingSequence: snapshot.plantingSequence,
      ...patch
    },
    changes
  };
}

export function replacePlot(plots: readonly PlotState[], index: number, next: PlotState): readonly PlotState[] {
  const result = plots.slice();
  result[index] = next;
  return result;
}

export function resolveCommandCrop(
  { snapshot, plot, definitions }: FarmRuleContext,
  command: HarvestCommand | DamageCropCommand
): FarmRuleFailure | { readonly ok: true; readonly cropState: CropState; readonly crop: CropDefinition } {
  const cropState = getCropState(snapshot, plot);
  if (!cropState) return rejectRule("CROP_NOT_FOUND", "土地上没有作物");
  if (cropState.instanceId !== command.cropInstanceId)
    return rejectRule("CROP_INSTANCE_CHANGED", "这块土地上的作物已经变化");
  const crop = getCrop(definitions, cropState.cropId);
  if (!crop) return rejectRule("INVALID_DEFINITION", "作物定义不存在");
  return { ok: true, cropState, crop };
}
