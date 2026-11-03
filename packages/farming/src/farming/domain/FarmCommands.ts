import type { FarmItemInput } from "./FarmItems";
import type { StorageWriteInput } from "../storage/StorageTypes";
import type { GroundTarget, FarmingGroundView, GroundBlockReason, PlotGroundState } from "./FarmingGround";
import type { FarmSnapshot } from "./FarmState";

export const FARM_RECEIPT_LIMIT = 256;

export interface PlotCropChange {
  readonly plotId: string;
  readonly cropId: string;
  readonly cropInstanceId: string;
}

export type FarmChange =
  | { readonly kind: "item-created" | "item-moved" | "item-reused" | "basket-content-changed"; readonly itemId: string }
  | { readonly kind: "carry-changed" }
  | {
      readonly kind: "basket-unloaded";
      readonly basketId: string;
      readonly allocations: readonly {
        readonly cropId: string;
        readonly itemId: string;
        readonly quantity: number;
        readonly containerId: string;
        readonly created: boolean;
      }[];
    }
  | {
      readonly kind: "container-created" | "container-content-changed" | "container-removed";
      readonly containerId: string;
    }
  | { readonly kind: "container-retention-changed" }
  | { readonly kind: "plot-created" | "plot-updated" | "plot-deleted"; readonly plotId: string }
  | { readonly kind: "plot-ground-changed"; readonly plotId: string; readonly ground: PlotGroundState }
  | (PlotCropChange & { readonly kind: "crop-removed"; readonly reason?: "hoe" | "destroyed" })
  | (PlotCropChange & { readonly kind: "crop-planted"; readonly growthUnits: number })
  | {
      readonly kind: "soil-irrigated";
      readonly water: {
        readonly input: number;
        readonly absorbed: number;
        readonly distributed: number;
        readonly lost: number;
      };
      readonly plotId: string;
      readonly previousMoistureUnits: number;
      readonly moistureUnits: number;
    }
  | {
      readonly kind: "soil-moisture-changed";
      readonly plotId: string;
      readonly previousMoistureUnits: number;
      readonly moistureUnits: number;
    }
  | (PlotCropChange & {
      readonly kind: "crop-growth-applied";
      readonly previousGrowthUnits: number;
      readonly growthUnits: number;
    })
  | (PlotCropChange & {
      readonly kind: "crop-stage-changed";
      readonly previousStageId: string;
      readonly stageId: string;
    })
  | (PlotCropChange & { readonly kind: "crop-matured" })
  | (PlotCropChange & {
      readonly kind: "crop-health-changed";
      readonly source: CropDamageSource;
      readonly previousHealthPermille: number;
      readonly healthPermille: number;
    })
  | (PlotCropChange & { readonly kind: "crop-harvested"; readonly itemId: string; readonly quantity: number })
  | {
      readonly kind: "inventory-changed";
      readonly itemId: string;
      readonly previousQuantity: number;
      readonly quantity: number;
    }
  | {
      readonly kind: "simulation-advanced";
      readonly previousSimulationTimeMs: number;
      readonly simulatedTimeMs: number;
      readonly elapsedSystemTimeMs: number;
      readonly capped: boolean;
    };

export interface FarmCommandReceipt {
  readonly commandId: string;
  readonly signature: string;
  readonly committedRevision: number;
  readonly changes: readonly FarmChange[];
  /** Persisted atomically with the write; reconstructs automatically captured guards after restoration. */
  readonly binding?: FarmCommandBinding;
}

export interface FarmCommandBinding {
  readonly requestSignature: string;
  readonly command: FarmCommand;
}

export interface FarmCommandBase {
  readonly commandId: string;
  readonly farmId: string;
  readonly expectedRevision: number;
  readonly expectedGroundRevision?: number;
  /** Captured by portable item use; guards the unique carrying slot at commit time. */
  readonly expectedCarriedItemId?: string;
}

export interface PlotCommandBase extends FarmCommandBase {
  readonly plotId: string;
}

export interface PlantCommand extends PlotCommandBase {
  readonly type: "plant";
  readonly seedId: string;
}

export interface IrrigateCommand extends PlotCommandBase {
  readonly type: "irrigate";
}

export interface HarvestCommand extends PlotCommandBase {
  readonly type: "harvest";
  readonly cropInstanceId: string;
}

export type CropDamageSource = "pest" | "animal" | "storm" | "wind" | "other";

export interface DamageCropCommand extends PlotCommandBase {
  readonly type: "damage-crop";
  readonly cropInstanceId: string;
  readonly source: CropDamageSource;
  readonly damagePermille: number;
  readonly pestPressureDeltaUnits?: number;
}

/** Consume a quantity from one grounded basket without transferring it to storage. */
export interface ConsumeBasketCommand extends FarmCommandBase {
  readonly type: "consume-basket";
  readonly basketId: string;
  readonly cropId: string;
  readonly itemId: string;
  readonly quantity: number;
}

export interface AdvanceTimeCommand extends FarmCommandBase {
  readonly type: "advance-time";
  readonly targetSystemTimeMs: number;
}

export interface CreatePlotInput extends GroundTarget {
  readonly label?: string;
}
export interface PlotPatch {
  readonly label?: string;
  readonly preparation?: "leveled";
}
export interface CreatePlotCommand extends FarmCommandBase {
  readonly type: "create-plot";
  readonly target: CreatePlotInput;
}
export interface HoeCommand extends FarmCommandBase {
  /** Re-tilling removes any occupying crop without yielding inventory. */
  readonly type: "hoe";
  readonly target: GroundTarget;
  /** Bind delayed actions to the observed occupant. null requires empty ground;
   * omit only for immediate actions protected by the original expectedRevision. */
  readonly expectedCropInstanceId?: string | null;
}
export interface UpdatePlotCommand extends PlotCommandBase {
  readonly type: "update-plot";
  readonly patch: PlotPatch;
}
export interface DeletePlotCommand extends PlotCommandBase {
  readonly type: "delete-plot";
  readonly cascadeCrop?: boolean;
}
export type PlotManagementCommand = CreatePlotCommand | HoeCommand | UpdatePlotCommand | DeletePlotCommand;
export type FarmCommand =
  | (FarmCommandBase & FarmItemInput)
  | (FarmCommandBase & StorageWriteInput)
  | PlantCommand
  | IrrigateCommand
  | HarvestCommand
  | DamageCropCommand
  | ConsumeBasketCommand
  | AdvanceTimeCommand
  | PlotManagementCommand;

export type FarmingErrorCode =
  | "BASKET_CAPACITY_INSUFFICIENT"
  | "ITEM_NOT_FOUND"
  | "ITEM_CHANGED"
  | "TOOL_REQUIRED"
  | "NO_ITEM_POSITION"
  | "NO_STORAGE_SPACE"
  | "CONTAINER_CAPACITY_INSUFFICIENT"
  | "INSUFFICIENT_INVENTORY"
  | GroundBlockReason
  | "CANCELLED"
  | "DESTROYED"
  | "BUSY"
  | "GROUND_CHANGED"
  | "PLOT_EXISTS"
  | "NOT_INITIALIZED"
  | "INVALID_DEFINITION"
  | "INVALID_SNAPSHOT"
  | "INVALID_COMMAND"
  | "FARM_MISMATCH"
  | "VERSION_CONFLICT"
  | "PLOT_NOT_FOUND"
  | "PLOT_NOT_TILLED"
  | "PLOT_OCCUPIED"
  | "CROP_NOT_FOUND"
  | "CROP_INSTANCE_CHANGED"
  | "ACTION_UNAVAILABLE"
  | "CROP_NOT_MATURE"
  | "STORAGE_FAILURE";

export interface CommandResult {
  readonly ok: boolean;
  readonly commandId: string;
  readonly revision: number;
  readonly replayed: boolean;
  readonly changes: readonly FarmChange[];
  readonly error?: Readonly<{
    code: FarmingErrorCode;
    message: string;
    capacity?: number;
    used?: number;
    required?: number;
  }>;
}

export interface ApplyFarmCommandContext {
  readonly waterSupply?: import("./FarmWaterSupply").FarmWaterSupplyInput;
  readonly environment?: import("./FarmEnvironment").FarmEnvironmentInput;
  readonly simulationConfig?: import("../config/FarmingSimulationConfig").FarmingSimulationConfig;
  readonly createCropInstanceId: () => string;
  readonly groundView?: FarmingGroundView;
  readonly targetSystemTimeMs?: number;
  readonly simulationStepMs?: number;
  readonly maximumCatchUpMs?: number;
}

export interface ApplyFarmCommandResult {
  readonly snapshot: FarmSnapshot;
  readonly result: CommandResult;
}
