import type { StorageWriteInput } from "../storage/StorageTypes";
import type { FarmActionInput, FarmActionOptions } from "../domain/FarmActions";
import type {
  CreatePlotInput,
  PlotPatch,
  FarmCommandBinding,
  DamageCropCommand,
  ConsumeBasketCommand,
  FarmCommandBase
} from "../domain/FarmCommands";

export type FarmingWriteInput =
  | import("../domain/FarmItems").FarmItemInput
  | Omit<DamageCropCommand, keyof FarmCommandBase | "pestPressureDeltaUnits">
  | Omit<ConsumeBasketCommand, keyof FarmCommandBase>
  | StorageWriteInput
  | FarmActionInput
  | { readonly type: "create-plot"; readonly target: CreatePlotInput }
  | { readonly type: "update-plot"; readonly plotId: string; readonly patch: PlotPatch };
export interface FarmingWriteAttempt {
  readonly input: FarmingWriteInput;
  readonly options: FarmActionOptions & { readonly commandId: string; readonly expectedRevision: number };
}

/** A caller's intent and the resolved command are two identities of the same durable write. */
export function boundAttempt(
  binding: FarmCommandBinding,
  input: FarmingWriteInput,
  options: FarmActionOptions
): FarmingWriteAttempt {
  const {
    farmId: _farmId,
    commandId,
    expectedRevision,
    expectedGroundRevision,
    expectedCarriedItemId,
    ...resolvedInput
  } = binding.command;
  if (resolvedInput.type === "advance-time") throw new Error("INVALID_COMMAND: 命令 ID 已用于系统操作");
  const attempt = {
    input: resolvedInput,
    options: {
      commandId,
      expectedRevision,
      ...(expectedCarriedItemId === undefined ? {} : { expectedCarriedItemId }),
      ...(expectedGroundRevision === undefined ? {} : { expectedGroundRevision })
    }
  };
  const request = stableRequest({ input, options });
  if (request !== binding.requestSignature && request !== stableRequest(attempt))
    throw new Error("INVALID_COMMAND: 命令 ID 已用于不同请求");
  return attempt;
}

export function stableRequest(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]])
        )
      : item
  );
}
