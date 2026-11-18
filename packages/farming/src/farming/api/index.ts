/** Engine-free external operations. All writes go through FarmingService transactions. */
export { FarmingService } from "../application/FarmingService";
export { FarmingDebugMode } from "../application/FarmingDebugMode";
export {
  inspectFarmingStarter,
  inspectFarmingOperation,
  STARTER_OPERATION_WIDTH_M
} from "../application/FarmingStarter";
export type { FarmingStarterPlacement, FarmingStarterInspection } from "../application/FarmingStarter";
export type * from "../domain/FarmingDiagnostics";
export type { FarmingServiceOptions, FarmingServiceChange, FarmingServiceError } from "../application/FarmingService";
export { BrowserSystemClock, ManualFarmClock } from "../application/FarmClock";
export type { FarmClock } from "../application/FarmClock";
export { getActionDefinitions } from "../domain/FarmActions";
export type {
  FarmActionId,
  FarmActionInput,
  FarmActionOptions,
  FarmActionDefinition,
  ActionAvailability
} from "../domain/FarmActions";
export type { CommandResult, FarmChange, FarmingErrorCode } from "../domain/FarmCommands";
export type { FarmSnapshot } from "../domain/FarmState";
export type { FarmingDefinitionSet, PlotDefinition } from "../domain/FarmDefinitions";
export type { CropStatusView, PlotStatusView } from "../domain/FarmQueries";
export { SOIL_MOISTURE_LABELS } from "../domain/FarmQueries";
export { normalizeSoilMoisture } from "../domain/SoilMoisture";
export type { FarmTimeAdvanceSummary } from "../domain/FarmSimulation";
export type { FarmRepository } from "../persistence/FarmRepository";

export {
  DEFAULT_PLOT_GRID,
  targetAtPoint,
  plotBounds,
  plotIdForTarget,
  GROUND_REASON_MESSAGES,
  inspectGround
} from "../domain/FarmingGround";
export type {
  FarmingGroundProvider,
  FarmingGroundView,
  FarmingGroundChange,
  GroundTarget,
  GroundBounds,
  GroundSample,
  GroundFootprint,
  GroundRay,
  GroundHit,
  PlotGrid,
  CultivationInspection,
  GroundSurface,
  GroundBlockReason,
  PlotGroundState
} from "../domain/FarmingGround";
export type { PlotView, PlotQuery } from "../domain/PlotQueries";
export type { CreatePlotInput, PlotPatch } from "../domain/FarmCommands";

export {
  FARMING_SIMULATION_CONFIG,
  resolveSimulationConfig,
  validateSimulationConfig
} from "../config/FarmingSimulationConfig";
export type { FarmingSimulationConfig, FarmingSimulationOverrides } from "../config/FarmingSimulationConfig";
export type { FieldValueResult } from "../domain/fields/SoilWaterField";

export { transportField, distributeFieldInput, validateFieldGraph } from "../domain/fields/SpatialField";
export type { FieldGraph, FieldNode, FieldEdge, FieldReaction } from "../domain/fields/SpatialField";

export { createDefaultFarmingLayout, DEFAULT_STORAGE_DEFINITIONS } from "../storage/StorageDefaults";
export type {
  FarmingStorageDefinitions,
  StorageContainerDefinition,
  CropStorageDefinition,
  FarmStorageState,
  StorageContainerState,
  StorageContent,
  StorageContainerQuery,
  StorageContainerView,
  StorageLayout,
  StorageProtectedArea,
  StorageWriteInput
} from "../storage/StorageTypes";

export type { FarmEnvironmentInput, FarmEnvironmentView } from "../domain/FarmEnvironment";
export type { CropHealthStatus } from "../domain/FarmQueries";
export type { SoilWaterRates } from "../domain/SoilMoisture";

export type {
  FarmNearWaterEntry,
  FarmNearWaterView,
  FarmWaterSupplyInput,
  FarmWaterSupplyDiagnostics
} from "../domain/FarmWaterSupply";

export {
  HARVEST_BASKET_CAPACITY,
  FARM_ITEM_SOFT_LIMIT,
  FARM_ITEM_TYPES,
  basketUsed,
  carriedItem
} from "../domain/FarmItems";
export type {
  FarmItem,
  FarmItemType,
  FarmItemsState,
  FarmCarry,
  FarmItemInput,
  BasketContent
} from "../domain/FarmItems";
export { resolveCarriedAction } from "../domain/ResolveCarriedAction";
