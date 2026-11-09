import {
  createWaterQualityPlanV2,
  type WaterQualityPlanV2,
  type WaterReflectionQualityBudgetV2,
  type WaterSurfaceEffectQualityBudgetV2
} from "../authoring/quality/WaterQualityPlan";
import type { WaterSpatialFieldQualityBudgetV1 } from "../authoring/body/WaterBodyAuthoringTypes";

/** Plain Source values. Identity and schema belong to the derived compiler plan. */
export type WaterQualitySettings = Omit<WaterQualityPlanV2, "id" | "schemaVersion">;
export type WaterQualityInput = Partial<
  Omit<WaterQualitySettings, "reflectionBudget" | "surfaceEffectBudget" | "spatialField">
> & {
  readonly reflectionBudget?: Partial<WaterReflectionQualityBudgetV2>;
  readonly surfaceEffectBudget?: Partial<WaterSurfaceEffectQualityBudgetV2>;
  readonly spatialField?: Partial<WaterSpatialFieldQualityBudgetV1>;
};

const spatialDefaults: Record<"lake" | "river" | "ocean", WaterSpatialFieldQualityBudgetV1> = {
  lake: {
    maximumHorizontalError: 1,
    maximumDepthError: 0,
    maximumGpuDepthDecodeError: 0.02,
    maximumGpuShoreDecodeError: 0.1,
    maximumAtlasPixels: 65536
  },
  river: {
    maximumHorizontalError: 0.25,
    maximumDepthError: 0,
    maximumGpuDepthDecodeError: 0,
    maximumGpuShoreDecodeError: 0,
    maximumAtlasPixels: Number.MAX_SAFE_INTEGER
  },
  ocean: {
    maximumHorizontalError: 4,
    maximumDepthError: 0,
    maximumGpuDepthDecodeError: 1,
    maximumGpuShoreDecodeError: 0.3,
    maximumAtlasPixels: 16777216
  }
};

function fields(value: unknown, names: readonly string[], path: string): void {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${path} must be a Quality value object.`);
  for (const key of Object.keys(value))
    if (!names.includes(key)) throw new TypeError(`Unknown Water Quality property '${path}.${key}'.`);
}

/** Defaults preserve the native kit budgets; explicit false and zero override them. */
export function createWaterQualitySettings(
  kind: "lake" | "river" | "ocean",
  input: Readonly<WaterQualityInput> = {}
): Readonly<WaterQualitySettings> {
  fields(
    input,
    [
      "geometry",
      "surfaceShading",
      "sceneFields",
      "opaqueDownsampling",
      "reflectionBudget",
      "surfaceEffectBudget",
      "query",
      "spatialField",
      "backendBudgets"
    ],
    "quality"
  );
  if (input.reflectionBudget !== undefined)
    fields(input.reflectionBudget, ["environment", "screenSpace"], "quality.reflectionBudget");
  if (input.surfaceEffectBudget !== undefined) {
    fields(input.surfaceEffectBudget, ["caustics"], "quality.surfaceEffectBudget");
    if (input.surfaceEffectBudget.caustics !== undefined && typeof input.surfaceEffectBudget.caustics !== "boolean")
      throw new TypeError("quality.surfaceEffectBudget.caustics must be boolean.");
  }
  if (input.spatialField !== undefined)
    fields(input.spatialField, Object.keys(spatialDefaults.lake), "quality.spatialField");
  if (input.backendBudgets !== undefined) {
    fields(input.backendBudgets, ["ocean"], "quality.backendBudgets");
    if (input.backendBudgets.ocean !== undefined)
      fields(
        input.backendBudgets.ocean,
        [
          "finitePatchSegments",
          "fixedLodRingPatchSegments",
          "fixedLodCentralPatchSegments",
          "fixedLodFirstRingPatchSegments",
          "nearshoreFixedStepRateHz",
          "nearshoreMaximumSeekSeconds",
          "windResponseFixedStepRateHz",
          "windResponseMaximumCatchUpSteps"
        ],
        "quality.backendBudgets.ocean"
      );
  }
  const {
    id: _id,
    schemaVersion: _version,
    ...settings
  } = createWaterQualityPlanV2({
    id: "component-water-quality",
    geometry: "high",
    surfaceShading: "high",
    sceneFields: "scene-color-depth",
    query: "dense",
    opaqueDownsampling: kind === "ocean" ? "2x" : "none",
    ...input,
    reflectionBudget: { environment: true, screenSpace: kind !== "ocean", ...input.reflectionBudget },
    surfaceEffectBudget: { caustics: true, ...input.surfaceEffectBudget },
    spatialField: { ...spatialDefaults[kind], ...input.spatialField }
  });
  return Object.freeze(settings);
}

/** Merge only typed Quality groups; ordinary Source Prefab merging handles inheritance. */
export function patchWaterQualitySettings(
  kind: "lake" | "river" | "ocean",
  previous?: WaterQualityInput,
  patch?: WaterQualityInput
): Readonly<WaterQualitySettings> {
  // Validate each supplied patch before spreading it; asset references are not Quality values.
  if (patch !== undefined) createWaterQualitySettings(kind, patch);
  const base = createWaterQualitySettings(kind, previous);
  return createWaterQualitySettings(kind, {
    ...base,
    ...patch,
    reflectionBudget: { ...base.reflectionBudget, ...patch?.reflectionBudget },
    surfaceEffectBudget: { ...base.surfaceEffectBudget, ...patch?.surfaceEffectBudget },
    spatialField: { ...base.spatialField, ...patch?.spatialField },
    backendBudgets: patch?.backendBudgets
      ? {
          ...base.backendBudgets,
          ...patch.backendBudgets,
          ...(patch.backendBudgets.ocean
            ? { ocean: { ...base.backendBudgets?.ocean, ...patch.backendBudgets.ocean } }
            : {})
        }
      : base.backendBudgets
  });
}
