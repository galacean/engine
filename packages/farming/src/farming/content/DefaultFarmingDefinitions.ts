import { FARMING_SIMULATION_CONFIG as SIMULATION } from "../config/FarmingSimulationConfig";
import { FARM_CROP_CONTENT } from "./CropContent";
import { plantingCatalog } from "./DefaultPlantingCatalog";
import type { FarmingDefinitionSet } from "../domain/index";
export const FARM_DEFINITION_SET_VERSION = 7;
export const FARM_DEFINITIONS: FarmingDefinitionSet = Object.freeze({
  version: FARM_DEFINITION_SET_VERSION,
  catalog: plantingCatalog,
  soilProfile: Object.freeze({
    id: "loam",
    version: 2,
    maximumMoistureUnits: SIMULATION.water.capacity,
    minimumMoistureUnits: SIMULATION.water.minimumMoisture,
    wiltingPointUnits: SIMULATION.water.wiltingPoint,
    evaporationSlowdownThresholdUnits: SIMULATION.water.evaporationSlowdownThreshold,
    fieldCapacityUnits: SIMULATION.water.fieldCapacity,
    initialMoistureUnits: SIMULATION.water.initialMoisture,
    wateringUnitsPerAction: SIMULATION.water.wateringAmount,
    evaporationUnitsPerMinute: SIMULATION.water.evaporationPerMinute,
    initialPhTenths: 65
  }),
  environmentProfile: Object.freeze({ initialAirTemperatureTenths: 240, initialLightUnits: 75 }),
  actionPolicy: Object.freeze({ allowIrrigateEmptyPlot: true }),
  seeds: Object.freeze(
    FARM_CROP_CONTENT.map((entry) =>
      Object.freeze({
        id: `${entry.id}-seed`,
        cropId: entry.id,
        name: `${entry.name}种子`,
        description: `理想条件下约 ${entry.idealSeconds} 秒 · 收获 ${entry.produce} × ${entry.quantity}`
      })
    )
  )
});
