import { createCanonicalWaterHashWriter } from "../water/compiler/index";
import { SEED_WORLD_R16_HEIGHT_SPAN_MILLIMETRES, roundTiesToEven } from "./WaterMetricEncodingV1";
import { maximumFootprintHorizontalErrorMetres, type SeedWorldWaterGridTransformV1 } from "./SeedWorldWaterGrid";

export const SEED_WORLD_WATER_ERROR_BUDGET_SCHEMA_VERSION = 1 as const;
export const SEED_WORLD_LAKE_RENDER_SURFACE_OFFSET_MILLIMETRES = -40 as const;
export const SEED_WORLD_LAKE_RENDER_SURFACE_OFFSET_METRES = SEED_WORLD_LAKE_RENDER_SURFACE_OFFSET_MILLIMETRES / 1_000;
/** Minimum published depth used when a Terrain cell becomes owned Water. */
export const SEED_WORLD_MINIMUM_OWNED_WATER_DEPTH_METRES = 0.1;

export interface SeedWorldWaterSemanticErrorBudgetV1 {
  readonly schemaVersion: typeof SEED_WORLD_WATER_ERROR_BUDGET_SCHEMA_VERSION;
  readonly heightQuantizationStepMicrometres: number;
  readonly maximumHeightQuantizationErrorMicrometres: number;
  readonly maximumWaterMetricQuantizationErrorMicrometres: number;
  readonly maximumFlowSpeedQuantizationErrorMicrometresPerSecond: number;
  readonly lakeLevelSafetyMarginMillimetres: number;
  readonly interiorClearanceToleranceMillimetres: number;
  readonly waterSemanticErrorBudgetHash: string;
}

export interface SeedWorldWaterRenderErrorBudgetV1 {
  readonly schemaVersion: typeof SEED_WORLD_WATER_ERROR_BUDGET_SCHEMA_VERSION;
  readonly maximumFootprintHorizontalErrorMillimetres: number;
  readonly maximumGpuDepthDecodeErrorMillimetres: number;
  readonly maximumGpuShoreDecodeErrorMillimetres: number;
  readonly maximumRenderSurfaceOffsetMillimetres: number;
  readonly waterRenderErrorBudgetHash: string;
}

export interface SeedWorldWaterErrorBudgetV1 {
  readonly semantic: Readonly<SeedWorldWaterSemanticErrorBudgetV1>;
  readonly render: Readonly<SeedWorldWaterRenderErrorBudgetV1>;
}

export function createSeedWorldWaterErrorBudgetV1(
  transform: SeedWorldWaterGridTransformV1
): Readonly<SeedWorldWaterErrorBudgetV1> {
  const semanticWithoutHash = {
    schemaVersion: SEED_WORLD_WATER_ERROR_BUDGET_SCHEMA_VERSION,
    heightQuantizationStepMicrometres: roundTiesToEven(
      (SEED_WORLD_R16_HEIGHT_SPAN_MILLIMETRES * 1_000) / 65_535,
      "heightQuantizationStepMicrometres"
    ),
    maximumHeightQuantizationErrorMicrometres: 13_200,
    maximumWaterMetricQuantizationErrorMicrometres: 500,
    maximumFlowSpeedQuantizationErrorMicrometresPerSecond: 500,
    lakeLevelSafetyMarginMillimetres: 100,
    interiorClearanceToleranceMillimetres: 80
  };
  const semantic = Object.freeze({
    ...semanticWithoutHash,
    waterSemanticErrorBudgetHash: hashSemanticBudget(semanticWithoutHash)
  });
  const renderWithoutHash = {
    schemaVersion: SEED_WORLD_WATER_ERROR_BUDGET_SCHEMA_VERSION,
    // An error budget is an upper bound, so preserve the complete theoretical
    // half-diagonal instead of rounding it down by a fraction of a millimetre.
    maximumFootprintHorizontalErrorMillimetres: Math.ceil(maximumFootprintHorizontalErrorMetres(transform) * 1_000),
    maximumGpuDepthDecodeErrorMillimetres: 50,
    maximumGpuShoreDecodeErrorMillimetres: 100,
    maximumRenderSurfaceOffsetMillimetres: Math.abs(SEED_WORLD_LAKE_RENDER_SURFACE_OFFSET_MILLIMETRES)
  };
  const render = Object.freeze({
    ...renderWithoutHash,
    waterRenderErrorBudgetHash: computeSeedWorldWaterRenderErrorBudgetHashV1(renderWithoutHash)
  });
  return Object.freeze({ semantic, render });
}

function hashSemanticBudget(budget: Omit<SeedWorldWaterSemanticErrorBudgetV1, "waterSemanticErrorBudgetHash">): string {
  const { writer, hash } = createCanonicalWaterHashWriter();
  writer
    .writeRecord("seed-world-water/semantic-error-budget/v1", budget.schemaVersion)
    .writeUint32(budget.heightQuantizationStepMicrometres)
    .writeUint32(budget.maximumHeightQuantizationErrorMicrometres)
    .writeUint32(budget.maximumWaterMetricQuantizationErrorMicrometres)
    .writeUint32(budget.maximumFlowSpeedQuantizationErrorMicrometresPerSecond)
    .writeUint32(budget.lakeLevelSafetyMarginMillimetres)
    .writeUint32(budget.interiorClearanceToleranceMillimetres);
  return hash.digestHex();
}

export function computeSeedWorldWaterRenderErrorBudgetHashV1(
  budget: Omit<SeedWorldWaterRenderErrorBudgetV1, "waterRenderErrorBudgetHash">
): string {
  const { writer, hash } = createCanonicalWaterHashWriter();
  writer
    .writeRecord("seed-world-water/render-error-budget/v1", budget.schemaVersion)
    .writeUint32(budget.maximumFootprintHorizontalErrorMillimetres)
    .writeUint32(budget.maximumGpuDepthDecodeErrorMillimetres)
    .writeUint32(budget.maximumGpuShoreDecodeErrorMillimetres)
    .writeUint32(budget.maximumRenderSurfaceOffsetMillimetres);
  return hash.digestHex();
}
