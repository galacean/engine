import { emptyFarmItems } from "./FarmItems";
import { applyFarmItem } from "./rules/FarmItemRules";
import { createInitialStorage, validateStorage, storageDefinitions } from "../storage/StorageRules";
import { containerBounds, inspectContainerGround } from "../storage/StoragePlacement";
import type { FarmStorageState, StorageLayout } from "../storage/StorageTypes";
import type { FarmingGroundView } from "./FarmingGround";
import {
  resolveSimulationConfig,
  simulationSignature,
  type FarmingSimulationConfig
} from "../config/FarmingSimulationConfig";
import { DEFAULT_PLOT_GRID, shapeSeedForId, validatePlotGrid, type PlotGrid } from "./FarmingGround";
import type { FarmingDefinitionSet, PlotDefinition } from "./FarmDefinitions";
import { FARM_SNAPSHOT_SCHEMA_VERSION, freezeSnapshot, type FarmSnapshot } from "./FarmState";
import { validateDefinitions, validatePlotDefinitions } from "./FarmValidation";
import { requirePositiveInteger, requireStableId, requireSystemTime } from "./validationUtils";
import type { FarmingDiagnosticIssue } from "./FarmingDiagnostics";

export function createInitialFarmSnapshot(options: {
  readonly simulationConfig?: FarmingSimulationConfig;
  readonly farmId: string;
  readonly layoutId: string;
  readonly layoutVersion: number;
  readonly definitions: FarmingDefinitionSet;
  readonly plots: readonly PlotDefinition[];
  readonly grid?: PlotGrid;
  readonly systemTimeMs: number;
  readonly groundView: FarmingGroundView;
  readonly storageLayout?: Partial<StorageLayout>;
  readonly initialContainerCounts?: Readonly<Record<string, number>>;
  /** Exact accepted placement from a host's preflight. Never run another placement search. */
  readonly initialStorage?: FarmStorageState;
  readonly onItemPlacementFailure?: (issue: FarmingDiagnosticIssue) => void;
}): FarmSnapshot {
  validateDefinitions(options.definitions);
  validatePlotGrid(options.grid ?? DEFAULT_PLOT_GRID);
  validatePlotDefinitions(options.plots);
  requireStableId(options.farmId, "farm");
  requireStableId(options.layoutId, "layout");
  requirePositiveInteger(options.layoutVersion, "Layout version");
  requireSystemTime(options.systemTimeMs);
  let snapshot = freezeSnapshot({
    schemaVersion: FARM_SNAPSHOT_SCHEMA_VERSION,
    farmId: options.farmId,
    layoutId: options.layoutId,
    layoutVersion: options.layoutVersion,
    definitionSetVersion: options.definitions.version,
    revision: 0,
    grid: { ...(options.grid ?? DEFAULT_PLOT_GRID) },
    simulation: {
      rulesSignature: simulationSignature(
        options.simulationConfig ?? resolveSimulationConfig(options.definitions.soilProfile)
      ),
      lastSystemTimeMs: options.systemTimeMs,
      simulatedTimeMs: 0,
      remainderMs: 0
    },
    environment: {
      airTemperatureTenths: options.definitions.environmentProfile.initialAirTemperatureTenths,
      lightUnits: options.definitions.environmentProfile.initialLightUnits
    },
    plots: options.plots.map((plot, index) => ({
      ...(plot.target ?? { groundId: "default-ground", cellX: index, cellZ: 0 }),
      label: plot.label,
      shapeSeed: shapeSeedForId(plot.id),
      ground: {
        availability: "available",
        reason: null,
        checkedAtSystemTimeMs: options.systemTimeMs,
        groundRevision: 0
      },
      plotId: plot.id,
      occupantId: null,
      soil: {
        preparation: "leveled",
        moistureUnits: options.definitions.soilProfile.initialMoistureUnits,
        lastIrrigatedSimulationMs: null,
        phTenths: options.definitions.soilProfile.initialPhTenths
      }
    })),
    items: emptyFarmItems(),
    plantingSequence: 0,
    crops: {},
    storage:
      options.initialStorage ??
      createInitialStorage(
        options.farmId,
        options.grid ?? DEFAULT_PLOT_GRID,
        options.plots.map((plot, index) => plot.target ?? { groundId: "default-ground", cellX: index, cellZ: 0 }),
        options.definitions,
        options.groundView,
        options.storageLayout,
        options.initialContainerCounts
      ),
    inventory: {},
    recentReceipts: []
  });
  const groundId = snapshot.storage.layout.groundId;
  const position = [snapshot.storage.layout.anchorX, 0, snapshot.storage.layout.anchorZ] as const;
  const starters = [
    ...["tomato", "pumpkin", "potato", "wheat"].flatMap((cropId) => {
      const seed = options.definitions.seeds.find((seed) => seed.cropId === cropId);
      return seed ? [{ itemType: "seed-bag" as const, seedId: seed.id }] : [];
    }),
    ...(["hoe", "watering-can", "harvest-basket"] as const).map((itemType) => ({ itemType, seedId: undefined }))
  ];
  for (const starter of starters) {
    const applied = applyFarmItem(
      snapshot,
      { type: "spawn-item", ...starter, count: 1, groundId, position },
      options.definitions,
      options.groundView
    );
    if (!applied.ok) {
      options.onItemPlacementFailure?.({
        code: applied.code,
        message: `初始道具 ${starter.itemType}${starter.seedId ? ` (${starter.seedId})` : ""} 已跳过：${applied.message}`,
        source: "farming",
        target: starter.seedId ?? starter.itemType
      });
      continue;
    }
    snapshot = freezeSnapshot({ ...snapshot, ...applied.state });
  }
  validateStorage(snapshot, options.definitions);
  if (options.initialStorage) {
    const types = storageDefinitions(options.definitions).containers;
    for (const c of snapshot.storage.containers) {
      if (c.quantity || c.cropId || c.itemId || !c.id.startsWith(`${options.farmId}/`))
        throw new Error("INVALID_ARGUMENT: 初始容器必须属于当前农场且为空");
      const support = inspectContainerGround(
        options.groundView,
        c.groundId,
        containerBounds(c, types.find((t) => t.id === c.typeId)!),
        snapshot.grid.maximumSlopeDegrees
      );
      if (!support.valid || Math.abs(c.position[1] - support.supportHeight!) > 0.01)
        throw new Error(`${support.reason ?? "CONTAINER_UNSUPPORTED"}: 已接受容器位置失效`);
    }
  }
  return snapshot;
}
