import {
  nearWaterView,
  nearWaterEntry,
  nearWaterPerMinute,
  type FarmWaterSupplyInput,
  type FarmNearWaterView
} from "./FarmWaterSupply";
import { soilWaterRates, type SoilWaterRates } from "./SoilMoisture";
import { resolveSimulationConfig } from "../config/FarmingSimulationConfig";
import type { FarmEnvironmentInput } from "./FarmEnvironment";
import type { FarmingSimulationConfig } from "../config/FarmingSimulationConfig";
import type { FarmingDefinitionSet } from "./FarmDefinitions";
import type { FarmSnapshot, PlotState } from "./FarmState";
import { getPlotStatus, type CropStatusView, type PlotStatusView } from "./FarmQueries";
import type { FarmingGroundInspectionCache } from "./FarmingGroundInspectionCache";
import {
  boundsIntersect,
  groundState,
  inspectGround,
  type FarmingGroundView,
  type GroundBounds,
  type GroundSample
} from "./FarmingGround";
export interface PlotView extends PlotState {
  readonly bounds: GroundBounds;
  readonly position: GroundSample["position"] | null;
  readonly normal: GroundSample["normal"] | null;
  readonly revision: number;
  readonly groundRevision: number;
  readonly crop: CropStatusView | null;
  readonly waterRates: SoilWaterRates;
  readonly nearWater: FarmNearWaterView | null;
}
export interface PlotQuery {
  readonly groundId?: string;
  readonly bounds?: GroundBounds;
  readonly preparation?: PlotState["soil"]["preparation"];
  readonly availability?: PlotState["ground"]["availability"];
  readonly occupied?: boolean;
  readonly cropId?: string;
}
export function resolvePlotView(
  snapshot: FarmSnapshot,
  definitions: FarmingDefinitionSet,
  view: FarmingGroundView,
  plot: PlotState,
  observedTime = plot.ground.checkedAtSystemTimeMs,
  inspectionCache?: FarmingGroundInspectionCache,
  simulationConfig?: FarmingSimulationConfig,
  environment?: FarmEnvironmentInput,
  waterSupply?: FarmWaterSupplyInput
): PlotView {
  const inspection = inspectionCache
    ? inspectionCache.inspect(view, snapshot.grid, plot, plot.plotId)
    : inspectGround(view, snapshot.grid, plot, plot.plotId);
  const ground = groundState(inspection, observedTime, plot.ground);
  const status = getPlotStatus(
    { ...snapshot, plots: [{ ...plot, ground }] },
    definitions,
    plot.plotId,
    simulationConfig
  )!;
  const water = (simulationConfig ?? resolveSimulationConfig(definitions.soilProfile)).water;
  return Object.freeze({
    ...plot,
    ground: Object.freeze(ground),
    bounds: inspection.bounds,
    position: ground.availability === "unloaded" ? null : inspection.position,
    normal: ground.availability === "unloaded" ? null : inspection.normal,
    revision: snapshot.revision,
    groundRevision: view.revision,
    waterRates: soilWaterRates(
      plot.soil.moistureUnits,
      water,
      environment?.snowing ? 0 : (environment?.rainWaterPerMinute ?? 0),
      nearWaterPerMinute(plot.soil.moistureUnits, water.minimumMoisture, waterSupply, nearWaterEntry(waterSupply, plot))
    ),
    nearWater: nearWaterView(waterSupply, plot),
    crop: status.crop
  });
}
export function matchesPlotQuery(plot: PlotView, query: PlotQuery): boolean {
  return (
    (query.groundId === undefined || plot.groundId === query.groundId) &&
    (!query.bounds || boundsIntersect(plot.bounds, query.bounds)) &&
    (!query.preparation || plot.soil.preparation === query.preparation) &&
    (!query.availability || plot.ground.availability === query.availability) &&
    (query.occupied === undefined || Boolean(plot.occupantId) === query.occupied) &&
    (!query.cropId || plot.crop?.cropId === query.cropId)
  );
}
