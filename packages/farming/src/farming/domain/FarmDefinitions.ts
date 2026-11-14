import type { FarmingStorageDefinitions } from "../storage/StorageTypes";
import type { GroundTarget } from "./FarmingGround";
import type { PlantingCatalog } from "../content/PlantingCatalog";
import type { PlantAppearanceBinding } from "../presentation/CropGrowthMapping";
export interface CropStageDefinition {
  readonly id: string;
  readonly name: string;
  readonly minimumProgress: number;
}

export type CropGrowthFactorId = "soilMoisture" | "airTemperature" | "light" | "soilPh" | "pestPressure";

export interface CropGrowthFactorDefinition {
  readonly minimum: number;
  readonly optimalMinimum: number;
  readonly optimalMaximum: number;
  readonly maximum: number;
}

export type CropGrowthFactors = Readonly<Record<CropGrowthFactorId, CropGrowthFactorDefinition>>;

export type CropGrowthConditions = Readonly<Record<CropGrowthFactorId, number>>;

export interface CropGrowthFactorStatus {
  readonly id: CropGrowthFactorId;
  readonly name: string;
  readonly unit: string;
  readonly value: number;
  readonly coefficientPermille: number;
}

export interface CropGrowthCycleDefinition {
  readonly id: string;
  readonly revision: number;
  readonly growthTarget: number;
  readonly baseGrowthUnitsPerSecond: number;
  readonly stages: readonly CropStageDefinition[];
}

export interface CropDefinition {
  readonly id: string;
  readonly version: number;
  readonly name: string;
  readonly cycle: CropGrowthCycleDefinition;
  readonly growthFactors: CropGrowthFactors;
  readonly appearance: PlantAppearanceBinding;
  readonly harvest: Readonly<{ itemId: string; itemName: string; quantity: number }>;
}

export interface SeedDefinition {
  readonly id: string;
  readonly name: string;
  readonly cropId: string;
  readonly description: string;
}

export interface SoilProfileDefinition {
  readonly id: string;
  readonly version: number;
  /** Water content units are volumetric percentage points, never a capacity-normalized index. */
  readonly maximumMoistureUnits: number;
  readonly minimumMoistureUnits: number;
  readonly wiltingPointUnits: number;
  readonly evaporationSlowdownThresholdUnits: number;
  readonly fieldCapacityUnits: number;
  readonly initialMoistureUnits: number;
  readonly wateringUnitsPerAction: number;
  readonly evaporationUnitsPerMinute: number;
  readonly initialPhTenths: number;
}

export interface FarmEnvironmentProfileDefinition {
  readonly initialAirTemperatureTenths: number;
  readonly initialLightUnits: number;
}

export interface FarmingDefinitionSet {
  readonly storage?: FarmingStorageDefinitions;
  readonly version: number;
  readonly soilProfile: SoilProfileDefinition;
  readonly environmentProfile: FarmEnvironmentProfileDefinition;
  readonly actionPolicy: Readonly<{ allowIrrigateEmptyPlot: boolean }>;
  readonly catalog: PlantingCatalog;
  readonly seeds: readonly SeedDefinition[];
}

export interface PlotDefinition {
  readonly target?: GroundTarget;
  readonly id: string;
  readonly label: string;
}
