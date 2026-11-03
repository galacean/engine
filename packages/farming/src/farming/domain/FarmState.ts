import type { GroundTarget, PlotGrid, PlotGroundState } from "./FarmingGround";
import type { PlantShape } from "../procedural/core/PlantGrowthRecipe";
import type { FarmCommandReceipt } from "./FarmCommands";
import { freezeCommandBinding } from "./CommandReceipts";

import type { FarmStorageState } from "../storage/StorageTypes";
import { freezeStorage, inventoryFromStorage } from "../storage/StorageRules";

import { freezeFarmItems, type FarmItemsState } from "./FarmItems";

export const FARM_SNAPSHOT_SCHEMA_VERSION = 10 as const;

export interface SimulationState {
  readonly rulesSignature: string;
  readonly lastSystemTimeMs: number;
  readonly simulatedTimeMs: number;
  readonly remainderMs: number;
}

export interface SoilState {
  readonly preparation: "leveled";
  readonly moistureUnits: number;
  readonly lastIrrigatedSimulationMs: number | null;
  readonly phTenths: number;
}

export interface CropState {
  readonly instanceId: string;
  readonly cropId: string;
  readonly cropDefinitionVersion: number;
  readonly cycleId: string;
  readonly cycleRevision: number;
  readonly plantDefinitionId: string;
  readonly plantDefinitionRevision: number;
  readonly recipeRevision: number;
  readonly shape: PlantShape;
  readonly anchorPlotId: string;
  /** Stable planting order, independent of wall time and terrain layout.  */
  readonly plantedOrder: number;
  readonly plantedAtSimulationMs: number;
  readonly lastEvaluatedSimulationMs: number;
  readonly growthUnits: number;
  /** Numerator remainder for growthUnits * multiplierPermille / 1_000. */
  readonly growthRemainderPermille: number;
  readonly healthPermille: number;
  readonly pestPressureUnits: number;
}

export interface FarmEnvironmentState {
  readonly airTemperatureTenths: number;
  readonly lightUnits: number;
}

export interface PlotState extends GroundTarget {
  readonly label: string;
  readonly shapeSeed: number;
  readonly ground: PlotGroundState;
  readonly plotId: string;
  readonly soil: SoilState;
  readonly occupantId: string | null;
}

export interface FarmSnapshot {
  readonly schemaVersion: typeof FARM_SNAPSHOT_SCHEMA_VERSION;
  readonly farmId: string;
  readonly layoutId: string;
  readonly layoutVersion: number;
  readonly definitionSetVersion: number;
  readonly revision: number;
  readonly grid: PlotGrid;
  readonly simulation: SimulationState;
  readonly environment: FarmEnvironmentState;
  readonly plots: readonly PlotState[];
  readonly plantingSequence: number;
  readonly crops: Readonly<Record<string, CropState>>;
  readonly storage: FarmStorageState;
  readonly items: FarmItemsState;
  /** Derived exclusively from storage containers. */
  readonly inventory: Readonly<Record<string, number>>;
  readonly recentReceipts: readonly FarmCommandReceipt[];
}

export function freezeSnapshot(snapshot: FarmSnapshot): FarmSnapshot {
  const plots = snapshot.plots.map((plot) =>
    Object.freeze({
      ...plot,
      soil: Object.freeze({ ...plot.soil }),
      ground: Object.freeze({
        ...plot.ground,
        waterSinceMs: plot.ground.waterSinceMs ? Object.freeze([...plot.ground.waterSinceMs]) : undefined
      })
    })
  );
  const crops = Object.fromEntries(
    Object.entries(snapshot.crops).map(([id, crop]) => [
      id,
      Object.freeze({ ...crop, shape: Object.freeze({ ...crop.shape }) })
    ])
  );
  const receipts = snapshot.recentReceipts.map((receipt) =>
    Object.freeze({
      ...receipt,
      ...(receipt.binding ? { binding: freezeCommandBinding(receipt.binding) } : {}),
      changes: Object.freeze(
        receipt.changes.map((change) =>
          Object.freeze(
            change.kind === "plot-ground-changed"
              ? {
                  ...change,
                  ground: Object.freeze({
                    ...change.ground,
                    waterSinceMs: change.ground.waterSinceMs
                      ? Object.freeze([...change.ground.waterSinceMs])
                      : undefined
                  })
                }
              : change.kind === "basket-unloaded"
                ? {
                    ...change,
                    allocations: Object.freeze(change.allocations.map((entry) => Object.freeze({ ...entry })))
                  }
                : change.kind === "soil-irrigated"
                  ? { ...change, water: Object.freeze({ ...change.water }) }
                  : { ...change }
          )
        )
      )
    })
  );
  return Object.freeze({
    ...snapshot,
    grid: Object.freeze({ ...snapshot.grid }),
    simulation: Object.freeze({ ...snapshot.simulation }),
    environment: Object.freeze({ ...snapshot.environment }),
    plots: Object.freeze(plots),
    crops: Object.freeze(crops),
    storage: freezeStorage(snapshot.storage),
    items: freezeFarmItems(snapshot.items),
    inventory: inventoryFromStorage(snapshot.storage),
    recentReceipts: Object.freeze(receipts)
  });
}
