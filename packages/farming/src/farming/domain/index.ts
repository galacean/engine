// Stable gameplay API. Internal rules do not import this barrel.
export { applyFarmCommand } from "./applyFarmCommand";
export { getActionDefinitions } from "./FarmActions";
export type { FarmActionId, FarmActionInput, FarmActionOptions, FarmActionDefinition } from "./FarmActions";
export { FARM_RECEIPT_LIMIT } from "./FarmCommands";
export type {
  AdvanceTimeCommand,
  ApplyFarmCommandContext,
  ApplyFarmCommandResult,
  CommandResult,
  CropDamageSource,
  DamageCropCommand,
  FarmChange,
  FarmCommand,
  FarmCommandReceipt,
  FarmingErrorCode,
  HarvestCommand,
  IrrigateCommand,
  PlantCommand
} from "./FarmCommands";
export type {
  CropDefinition,
  CropGrowthConditions,
  CropGrowthFactorDefinition,
  CropGrowthFactorId,
  CropGrowthFactorStatus,
  CropGrowthFactors,
  CropStageDefinition,
  FarmEnvironmentProfileDefinition,
  FarmingDefinitionSet,
  CropGrowthCycleDefinition,
  PlotDefinition,
  SeedDefinition,
  SoilProfileDefinition
} from "./FarmDefinitions";
export { getActionAvailability, getCropStatus, getFarmStatus, getPlotStatus } from "./FarmQueries";
export type { ActionAvailability, CropStatusView, PlotStatusView, SoilMoistureLabel } from "./FarmQueries";
export { FARM_MAX_CATCH_UP_MS, FARM_SIMULATION_STEP_MS, settleFarmTime } from "./FarmSimulation";
export type { FarmTimeAdvanceSummary, SettleFarmTimeResult } from "./FarmSimulation";
export { FARM_SNAPSHOT_SCHEMA_VERSION, freezeSnapshot } from "./FarmState";
export { createInitialFarmSnapshot } from "./createInitialFarmSnapshot";
export type { CropState, FarmEnvironmentState, FarmSnapshot, PlotState, SimulationState, SoilState } from "./FarmState";
export { validateDefinitions, validateFarmSnapshot, validatePlotDefinitions } from "./FarmValidation";
export { cropProgressPercent, getCrop, getCropState, isCropMature, resolveCropStage } from "./rules/CropGrowthRules";

export * from "./FarmingGround";
export * from "./FarmingDiagnostics";
export type { FarmEnvironmentInput, FarmEnvironmentView } from "./FarmEnvironment";
export { cropHealthStatus } from "./FarmQueries";
export type { CropHealthStatus } from "./FarmQueries";
export type { SoilWaterRates } from "./SoilMoisture";
export { soilWaterRates, settleSoilMoisture } from "./SoilMoisture";
export { normalizeSoilMoisture } from "./SoilMoisture";
export type { PlotView, PlotQuery } from "./PlotQueries";
export type {
  CreatePlotInput,
  PlotPatch,
  CreatePlotCommand,
  UpdatePlotCommand,
  DeletePlotCommand,
  HoeCommand,
  PlotManagementCommand
} from "./FarmCommands";

export type {
  FarmNearWaterEntry,
  FarmNearWaterView,
  FarmWaterSupplyInput,
  FarmWaterSupplyDiagnostics
} from "./FarmWaterSupply";
