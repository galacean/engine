import {
  simulationSoilProfile,
  simulationSignature,
  validateSimulationConfig,
  type FarmingSimulationConfig
} from "../config/FarmingSimulationConfig";
import { DEFAULT_PLOT_GRID, isGroundTarget, validatePlotGrid, type PlotGrid } from "./FarmingGround";
import { requirePlantingCatalog } from "../content/PlantingCatalog";
import { validatePlantShape } from "../procedural/core/PlantGrowthRecipe";
import { FARM_RECEIPT_LIMIT } from "./FarmCommands";
import { isFarmCommand } from "./FarmCommandValidation";
import { commandSignature, MAX_COMMAND_SIGNATURE_LENGTH, MAX_REQUEST_SIGNATURE_LENGTH } from "./CommandReceipts";
import type { FarmingDefinitionSet, PlotDefinition } from "./FarmDefinitions";
import type { FarmSnapshot } from "./FarmState";
import { FARM_SNAPSHOT_SCHEMA_VERSION } from "./FarmState";
import { FarmSnapshotCompatibilityError } from "./FarmSnapshotCompatibilityError";
import { validateFarmItems } from "./rules/FarmItemRules";
import { removeRetiredFarmItems } from "./RetiredFarmItems";
import { validateStorage, validateStorageDefinitions } from "../storage/StorageRules";
import { getCrop } from "./rules/CropGrowthRules";
import {
  isRecord,
  requireNonNegativeInteger,
  requirePositiveInteger,
  requireStableId,
  requireSystemTime
} from "./validationUtils";

export function validateDefinitions(definitions: FarmingDefinitionSet): void {
  requirePlantingCatalog(definitions.catalog);
  validateStorageDefinitions(definitions);
  validateFarmingRules(definitions);
  validateFarmingSeeds(definitions.catalog, definitions.seeds);
}

/** Shared by serialized rule assets and runtime service construction. */
export function validateFarmingRules(
  definitions: Pick<FarmingDefinitionSet, "version" | "soilProfile" | "environmentProfile" | "actionPolicy">
): void {
  requirePositiveInteger(definitions.version, "Definition set version");
  if (!definitions.soilProfile) throw new Error("Missing soil profile.");
  if (typeof definitions.actionPolicy?.allowIrrigateEmptyPlot !== "boolean")
    throw new Error("Invalid farming action policy.");
  const soil = definitions.soilProfile;
  requireStableId(soil.id, "soil profile");
  requirePositiveInteger(soil.version, "Soil profile version");
  for (const [name, value, minimum] of [
    ["Maximum soil moisture", soil.maximumMoistureUnits, Number.MIN_VALUE],
    ["Minimum soil moisture", soil.minimumMoistureUnits, 0],
    ["Soil wilting point", soil.wiltingPointUnits, 0],
    ["Soil evaporation slowdown threshold", soil.evaporationSlowdownThresholdUnits, 0],
    ["Soil field capacity", soil.fieldCapacityUnits, 0],
    ["Initial soil moisture", soil.initialMoistureUnits, 0],
    ["Watering amount", soil.wateringUnitsPerAction, Number.MIN_VALUE],
    ["Soil evaporation", soil.evaporationUnitsPerMinute, 0]
  ] as const)
    if (!Number.isFinite(value) || value < minimum) throw new Error(`Invalid ${name}`);
  {
    requireNonNegativeInteger(soil.initialPhTenths, "Initial soil pH");
    if (soil.initialPhTenths < 30 || soil.initialPhTenths > 100) throw new Error("Initial soil pH is out of range.");
  }
  if (!definitions.environmentProfile) throw new Error("Missing environment profile.");
  {
    if (!Number.isInteger(definitions.environmentProfile.initialAirTemperatureTenths)) {
      throw new Error("Initial air temperature must use integer tenths.");
    }
    requireNonNegativeInteger(definitions.environmentProfile.initialLightUnits, "Initial light");
    if (definitions.environmentProfile.initialLightUnits > 100) throw new Error("Initial light exceeds 100.");
  }
  if (
    soil.maximumMoistureUnits > 100 ||
    soil.minimumMoistureUnits >= soil.maximumMoistureUnits ||
    soil.minimumMoistureUnits > soil.wiltingPointUnits ||
    soil.wiltingPointUnits > soil.fieldCapacityUnits ||
    soil.evaporationSlowdownThresholdUnits < soil.minimumMoistureUnits ||
    soil.evaporationSlowdownThresholdUnits > soil.fieldCapacityUnits ||
    soil.initialMoistureUnits < soil.minimumMoistureUnits
  )
    throw new Error("Invalid soil moisture bounds.");
  if (soil.fieldCapacityUnits > soil.maximumMoistureUnits)
    throw new Error("Soil field capacity exceeds maximum moisture.");
  if (soil.initialMoistureUnits > soil.fieldCapacityUnits)
    throw new Error("Initial soil moisture exceeds field capacity.");
}

export function validateFarmingSeeds(
  catalog: FarmingDefinitionSet["catalog"],
  seeds: FarmingDefinitionSet["seeds"]
): void {
  if (!Array.isArray(seeds)) throw new Error("Invalid seed definitions.");
  const cropIds = new Set(catalog.crops.map((crop) => crop.id));

  const seedIds = new Set<string>();
  for (const seed of seeds) {
    requireStableId(seed.id, "seed");
    if (seedIds.has(seed.id)) throw new Error(`Duplicate seed id: ${seed.id}`);
    seedIds.add(seed.id);
    if (!seed.name.trim()) throw new Error(`Seed name is required: ${seed.id}`);
    if (!cropIds.has(seed.cropId)) throw new Error(`Seed references an unknown crop: ${seed.id}/${seed.cropId}`);
  }
  if (!seedIds.size) throw new Error("At least one seed definition is required.");
}
export function validatePlotDefinitions(plots: readonly PlotDefinition[]): void {
  const ids = new Set<string>();
  for (const plot of plots) {
    requireStableId(plot.id, "plot");
    if (ids.has(plot.id)) throw new Error(`Duplicate plot id: ${plot.id}`);
    ids.add(plot.id);
    if (!plot.label.trim()) throw new Error(`Plot label is required: ${plot.id}`);
  }
}

export function validateFarmSnapshot(
  snapshot: FarmSnapshot,
  expected: {
    readonly farmId: string;
    readonly layoutId: string;
    readonly layoutVersion: number;
    readonly definitions: FarmingDefinitionSet;
    readonly plots: readonly PlotDefinition[];
    readonly grid?: PlotGrid;
    readonly validatePlacement?: boolean;
  }
): void {
  if (!snapshot || snapshot.schemaVersion !== FARM_SNAPSHOT_SCHEMA_VERSION) {
    throw new Error("Unsupported or missing farm snapshot schema version.");
  }
  if (snapshot.farmId !== expected.farmId) throw new Error("Farm snapshot id does not match this farm.");
  if (snapshot.layoutId !== expected.layoutId || snapshot.layoutVersion !== expected.layoutVersion) {
    throw new Error("Farm snapshot layout version does not match this farm.");
  }
  requirePositiveInteger(snapshot.definitionSetVersion, "Farm snapshot definition version");
  if (snapshot.definitionSetVersion !== expected.definitions.version) {
    throw new FarmSnapshotCompatibilityError("Farm snapshot definition version does not match this farm.");
  }
  requireNonNegativeInteger(snapshot.revision, "Farm revision");
  requireSystemTime(snapshot.simulation?.lastSystemTimeMs);
  if (typeof snapshot.simulation?.rulesSignature !== "string") throw new Error("Missing simulation rules signature");
  requireNonNegativeInteger(snapshot.simulation?.simulatedTimeMs, "Simulated time");
  requireNonNegativeInteger(snapshot.simulation?.remainderMs, "Simulation remainder");
  if (snapshot.simulation.remainderMs >= 60_000) throw new Error("Simulation remainder is out of range.");
  if (!snapshot.environment) throw new Error("Missing farm environment.");
  {
    if (!Number.isInteger(snapshot.environment.airTemperatureTenths)) throw new Error("Invalid farm air temperature.");
    requireNonNegativeInteger(snapshot.environment.lightUnits, "Farm light");
    if (snapshot.environment.lightUnits > 100) throw new Error("Farm light exceeds 100.");
  }

  validatePlotGrid(snapshot.grid);
  const grid = expected.grid ?? DEFAULT_PLOT_GRID;
  if (Object.keys(grid).some((key) => snapshot.grid[key as keyof PlotGrid] !== grid[key as keyof PlotGrid]))
    throw new Error("Farm grid does not match this host.");
  if (!Array.isArray(snapshot.plots)) throw new Error("Invalid farm snapshot plots.");

  if (!isRecord(snapshot.crops)) throw new Error("Invalid farm crop instances.");
  const occupied = new Set<string>();
  const seenPlots = new Set<string>();
  const seenCells = new Set<string>();
  for (const plot of snapshot.plots) {
    if (seenPlots.has(plot.plotId)) throw new Error(`Invalid plot in snapshot: ${plot.plotId}`);
    requireStableId(plot.plotId, "plot");
    seenPlots.add(plot.plotId);
    if (
      !isGroundTarget({ groundId: plot.groundId, cellX: plot.cellX, cellZ: plot.cellZ }) ||
      typeof plot.label !== "string" ||
      !plot.label.trim() ||
      plot.label.length > 80
    )
      throw new Error("Invalid plot identity");
    const cell = `${plot.groundId}/${plot.cellX}/${plot.cellZ}`;
    if (seenCells.has(cell)) throw new Error("Duplicate farming cell");
    seenCells.add(cell);
    requireNonNegativeInteger(plot.shapeSeed, "Shape seed");
    if (!plot.ground || !["available", "blocked", "unloaded"].includes(plot.ground.availability))
      throw new Error("Invalid plot ground state");
    const reasons = [
      "GROUND_MISSING",
      "GROUND_ROCK",
      "GROUND_TOO_STEEP",
      "GROUND_BLOCKED",
      "GROUND_UNDERWATER",
      "GROUND_UNSUPPORTED"
    ];
    if (plot.ground.availability === "available" ? plot.ground.reason !== null : !reasons.includes(plot.ground.reason!))
      throw new Error("Invalid ground reason");
    if ((plot.ground.availability === "unloaded") !== (plot.ground.reason === "GROUND_MISSING"))
      throw new Error("Invalid ground residency");
    requireSystemTime(plot.ground.checkedAtSystemTimeMs);
    if (plot.ground.resumedAtSystemTimeMs !== undefined) {
      requireSystemTime(plot.ground.resumedAtSystemTimeMs);
      if (plot.ground.availability !== "available") throw new Error("Invalid ground recovery state");
    }
    requireNonNegativeInteger(plot.ground.groundRevision, "Ground revision");
    if (plot.ground.waterMask !== undefined) {
      if (
        !Number.isInteger(plot.ground.waterMask) ||
        plot.ground.waterMask < 0 ||
        plot.ground.waterMask > 15 ||
        !Array.isArray(plot.ground.waterSinceMs) ||
        plot.ground.waterSinceMs.length !== 4
      )
        throw new Error("Invalid water connectivity");
      plot.ground.waterSinceMs.forEach(requireSystemTime);
      requireNonNegativeInteger(plot.ground.waterCheckedRevision!, "Water ground revision");
    }
    if (!plot.soil || plot.soil.preparation !== "leveled") {
      throw new Error(`Invalid soil preparation: ${plot.plotId}`);
    }
    if (
      !Number.isFinite(plot.soil.moistureUnits) ||
      plot.soil.moistureUnits < expected.definitions.soilProfile.minimumMoistureUnits
    )
      throw new Error(`Invalid soil moisture: ${plot.plotId}`);
    if (plot.soil.moistureUnits > expected.definitions.soilProfile.maximumMoistureUnits) {
      throw new Error(`Soil moisture exceeds capacity: ${plot.plotId}`);
    }
    if (plot.soil.lastIrrigatedSimulationMs !== null) {
      requireNonNegativeInteger(plot.soil.lastIrrigatedSimulationMs, `Last irrigation time: ${plot.plotId}`);
      if (plot.soil.lastIrrigatedSimulationMs > snapshot.simulation.simulatedTimeMs) {
        throw new Error(`Last irrigation time exceeds simulation time: ${plot.plotId}`);
      }
    }
    {
      requireNonNegativeInteger(plot.soil.phTenths, `Soil pH: ${plot.plotId}`);
      if (plot.soil.phTenths < 30 || plot.soil.phTenths > 100)
        throw new Error(`Soil pH is out of range: ${plot.plotId}`);
    }
    if (plot.occupantId === null) continue;
    requireStableId(plot.occupantId, `plot occupant in ${plot.plotId}`);
    if (occupied.has(plot.occupantId)) throw new Error(`Crop instance occupies more than one plot: ${plot.occupantId}`);
    occupied.add(plot.occupantId);
    const cropState = snapshot.crops[plot.occupantId];
    if (!cropState || cropState.anchorPlotId !== plot.plotId)
      throw new Error(`Plot occupant is missing or mis-anchored: ${plot.plotId}`);
  }
  const plantingOrders = new Set<number>();
  requireNonNegativeInteger(snapshot.plantingSequence, "Planting sequence");
  for (const [instanceId, cropState] of Object.entries(snapshot.crops)) {
    {
      if (plantingOrders.has(cropState.plantedOrder)) throw new Error("Duplicate crop planting order");
      plantingOrders.add(cropState.plantedOrder);
      if (cropState.plantedOrder > snapshot.plantingSequence) throw new Error("Planting order exceeds sequence");
    }
    if (instanceId !== cropState.instanceId || !occupied.has(instanceId))
      throw new Error(`Orphaned crop instance: ${instanceId}`);
    requireStableId(cropState.instanceId, "crop instance");
    requireStableId(cropState.cropId, "crop definition");
    requirePositiveInteger(cropState.cropDefinitionVersion, "Crop definition version");
    const crop = getCrop(expected.definitions, cropState.cropId);
    if (!crop || crop.version !== cropState.cropDefinitionVersion) {
      throw new FarmSnapshotCompatibilityError(
        `Snapshot references an unavailable crop definition: ${cropState.cropId}`
      );
    }
    requireStableId(cropState.cycleId, "crop cycle");
    requireStableId(cropState.plantDefinitionId, "plant definition");
    requirePositiveInteger(cropState.cycleRevision, "Crop cycle revision");
    requirePositiveInteger(cropState.plantDefinitionRevision, "Plant definition revision");
    requirePositiveInteger(cropState.recipeRevision, "Plant recipe revision");
    if (
      cropState.cycleId !== crop.cycle.id ||
      cropState.cycleRevision !== crop.cycle.revision ||
      cropState.plantDefinitionId !== crop.appearance.plantId ||
      cropState.plantDefinitionRevision !== crop.appearance.plantRevision ||
      cropState.recipeRevision !== crop.appearance.recipeRevision
    )
      throw new FarmSnapshotCompatibilityError(`Snapshot references unavailable plant content: ${instanceId}`);
    validatePlantShape(cropState.shape);
    requireNonNegativeInteger(cropState.growthUnits, `Crop growth: ${instanceId}`);
    if (cropState.growthUnits > crop.cycle.growthTarget) throw new Error(`Invalid growth in snapshot: ${instanceId}`);
    requireNonNegativeInteger(cropState.growthRemainderPermille, `Crop growth remainder: ${instanceId}`);
    if (cropState.growthRemainderPermille >= 1_000)
      throw new Error(`Crop growth remainder is out of range: ${instanceId}`);
    {
      requireNonNegativeInteger(cropState.healthPermille, `Crop health: ${instanceId}`);
      if (cropState.healthPermille > 1_000) throw new Error(`Crop health exceeds 1000: ${instanceId}`);
    }
    {
      requireNonNegativeInteger(cropState.pestPressureUnits, `Crop pest pressure: ${instanceId}`);
      if (cropState.pestPressureUnits > 100) throw new Error(`Crop pest pressure exceeds 100: ${instanceId}`);
    }
    requirePositiveInteger(cropState.plantedOrder, `Crop planting order: ${instanceId}`);
    requireNonNegativeInteger(cropState.plantedAtSimulationMs, `Crop planted time: ${instanceId}`);
    requireNonNegativeInteger(cropState.lastEvaluatedSimulationMs, `Crop evaluated time: ${instanceId}`);
    if (
      cropState.plantedAtSimulationMs > cropState.lastEvaluatedSimulationMs ||
      cropState.lastEvaluatedSimulationMs > snapshot.simulation.simulatedTimeMs
    ) {
      throw new Error(`Invalid crop simulation times: ${instanceId}`);
    }
  }
  if (!isRecord(snapshot.inventory)) throw new Error("Invalid farm inventory.");
  for (const [itemId, quantity] of Object.entries(snapshot.inventory)) {
    requireStableId(itemId, "inventory item");
    requireNonNegativeInteger(quantity, `Inventory quantity: ${itemId}`);
  }
  validateStorage(snapshot, expected.definitions, expected.validatePlacement ?? true);
  validateFarmItems(snapshot, expected.definitions);
  validateReceipts(snapshot);
}

export function validateReceipts(snapshot: FarmSnapshot): void {
  if (!Array.isArray(snapshot.recentReceipts) || snapshot.recentReceipts.length > FARM_RECEIPT_LIMIT) {
    throw new Error("Invalid command receipt history.");
  }
  const commandIds = new Set<string>();
  let previousRevision = 0;
  for (const receipt of snapshot.recentReceipts) {
    requireStableId(receipt.commandId, "receipt command");
    if (commandIds.has(receipt.commandId)) throw new Error(`Duplicate command receipt: ${receipt.commandId}`);
    commandIds.add(receipt.commandId);
    if (
      !Number.isInteger(receipt.committedRevision) ||
      receipt.committedRevision <= previousRevision ||
      receipt.committedRevision > snapshot.revision
    ) {
      throw new Error(`Invalid command receipt revision: ${receipt.commandId}`);
    }
    previousRevision = receipt.committedRevision;
    if (
      typeof receipt.signature !== "string" ||
      !receipt.signature ||
      receipt.signature.length > MAX_COMMAND_SIGNATURE_LENGTH
    ) {
      throw new Error(`Invalid command receipt signature: ${receipt.commandId}`);
    }
    if (!Array.isArray(receipt.changes)) throw new Error(`Invalid command receipt changes: ${receipt.commandId}`);
    if (receipt.binding !== undefined) {
      const binding = receipt.binding;
      if (
        !binding ||
        typeof binding.requestSignature !== "string" ||
        !binding.requestSignature ||
        binding.requestSignature.length > MAX_REQUEST_SIGNATURE_LENGTH ||
        !isFarmCommand(binding.command) ||
        binding.command.farmId !== snapshot.farmId ||
        binding.command.commandId !== receipt.commandId ||
        commandSignature(binding.command) !== receipt.signature
      )
        throw new Error(`Invalid command receipt binding: ${receipt.commandId}`);
    }
    for (const change of receipt.changes) {
      if (!isRecord(change) || typeof change.kind !== "string")
        throw new Error(`Invalid command receipt change: ${receipt.commandId}`);
      if ("plotId" in change) requireStableId(change.plotId as string, "receipt plot");
    }
  }
}

/** Normalize and validate saved state once; callers persisting it must use the returned snapshot. */
export function validateConfiguredFarmSnapshot(
  snapshot: FarmSnapshot,
  expected: Parameters<typeof validateFarmSnapshot>[1],
  config: FarmingSimulationConfig
): FarmSnapshot {
  snapshot = removeRetiredFarmItems(snapshot);
  // Check the resource signature before resource-dependent bounds can mistake a
  // configuration edit for corrupt soil/clock data. Old schemas retain recovery.
  if (
    snapshot?.schemaVersion === FARM_SNAPSHOT_SCHEMA_VERSION &&
    typeof snapshot.simulation?.rulesSignature === "string" &&
    snapshot.simulation.rulesSignature !== simulationSignature(config)
  )
    throw new FarmSnapshotCompatibilityError("Farming simulation rules do not match this save");
  validateSimulationConfig(config, snapshot.grid.cellSize);
  validateFarmSnapshot(snapshot, {
    ...expected,
    definitions: {
      ...expected.definitions,
      soilProfile: simulationSoilProfile(expected.definitions.soilProfile, config)
    }
  });
  if (snapshot.simulation.remainderMs >= config.stepMs) throw new Error("Invalid simulation clock remainder");
  return snapshot;
}
