/** Orthogonal Water cost/capability plan. It deliberately contains no Look values. */
import type { WaterOpaqueDownsampling, WaterSpatialFieldQualityBudgetV1 } from "../body/WaterBodyAuthoringTypes";
import { hashStableValue } from "../../compiler/shared/determinism";
import {
  normalizeWaterReflectionPolicy,
  waterReflectionPolicySourceChain,
  type WaterReflectionPolicyMode,
  type WaterReflectionPolicy
} from "../optics/WaterReflectionPolicy";

export const WATER_QUALITY_PLAN_SCHEMA_VERSION = 2 as const;
export const WATER_OCEAN_MAX_FINITE_PATCH_SEGMENTS = 192;
export const WATER_OCEAN_MAX_RING_PATCH_SEGMENTS = 96;
export const WATER_OCEAN_MAX_CENTRAL_PATCH_SEGMENTS = 192;
export const WATER_OCEAN_MAX_NEARSHORE_FIXED_STEP_RATE_HZ = 30;
export const WATER_OCEAN_MAX_NEARSHORE_SEEK_SECONDS = 600;
export const WATER_OCEAN_MAX_WIND_RESPONSE_FIXED_STEP_RATE_HZ = 120;
export const WATER_OCEAN_MAX_WIND_RESPONSE_CATCH_UP_STEPS = 16;

export type WaterQualityLevelV2 = "low" | "medium" | "high";
export type WaterSceneFieldQualityV2 = "local-only" | "scene-color" | "scene-color-depth";
export type WaterQueryQualityV2 = "off" | "sparse" | "dense";

/** Implementation capabilities only; source ordering remains exclusively owned by WaterLook. */
export interface WaterReflectionQualityBudgetV2 {
  readonly environment: boolean;
  readonly screenSpace: boolean;
}

export interface WaterSurfaceEffectQualityBudgetV2 {
  /** Whether this implementation tier budgets the caustics pass/resources. */
  readonly caustics: boolean;
}

/** Backend-specific implementation limits. They may change cost, never source, layout, or Look semantics. */
export interface WaterOceanBackendQualityBudgetV1 {
  readonly finitePatchSegments?: number;
  readonly fixedLodRingPatchSegments?: number;
  readonly fixedLodCentralPatchSegments?: number;
  readonly fixedLodFirstRingPatchSegments?: number;
  readonly nearshoreFixedStepRateHz?: number;
  readonly nearshoreMaximumSeekSeconds?: number;
  readonly windResponseFixedStepRateHz?: number;
  readonly windResponseMaximumCatchUpSteps?: number;
}

export interface WaterBackendQualityBudgetsV1 {
  readonly ocean?: Readonly<WaterOceanBackendQualityBudgetV1>;
}

export interface WaterQualityPlanV2 {
  readonly schemaVersion: typeof WATER_QUALITY_PLAN_SCHEMA_VERSION;
  readonly id: string;
  readonly geometry: WaterQualityLevelV2;
  readonly surfaceShading: WaterQualityLevelV2;
  readonly sceneFields: WaterSceneFieldQualityV2;
  /** Camera Opaque Color resolution; independent from full-resolution Camera Depth semantics. */
  readonly opaqueDownsampling?: WaterOpaqueDownsampling;
  readonly reflectionBudget: Readonly<WaterReflectionQualityBudgetV2>;
  readonly surfaceEffectBudget: Readonly<WaterSurfaceEffectQualityBudgetV2>;
  readonly query: WaterQueryQualityV2;
  readonly spatialField: WaterSpatialFieldQualityBudgetV1;
  readonly backendBudgets?: Readonly<WaterBackendQualityBudgetsV1>;
}

export type WaterQualityPlanInputV2 = Omit<WaterQualityPlanV2, "schemaVersion" | "surfaceEffectBudget"> &
  Partial<Pick<WaterQualityPlanV2, "surfaceEffectBudget">>;

const LEVELS = Object.freeze(["low", "medium", "high"] as const);
const SCENE_FIELDS = Object.freeze(["local-only", "scene-color", "scene-color-depth"] as const);
const OPAQUE_DOWNSAMPLING = Object.freeze(["none", "2x", "4x"] as const);
const QUERIES = Object.freeze(["off", "sparse", "dense"] as const);

/** Preserves the V2 default while allowing products to budget Scene Color independently from Scene Depth. */
export function resolveWaterOpaqueDownsampling(
  plan: Pick<WaterQualityPlanV2, "sceneFields" | "opaqueDownsampling">
): WaterOpaqueDownsampling {
  if (plan.opaqueDownsampling !== undefined) return plan.opaqueDownsampling;
  return plan.sceneFields === "scene-color-depth" ? "none" : plan.sceneFields === "scene-color" ? "2x" : "4x";
}

function freezeReflectionBudget(
  budget: Readonly<WaterReflectionQualityBudgetV2>
): Readonly<WaterReflectionQualityBudgetV2> {
  if (!budget || typeof budget !== "object") {
    throw new TypeError("$.reflectionBudget must be an object.");
  }
  for (const key of ["environment", "screenSpace"] as const) {
    if (typeof budget[key] !== "boolean") {
      throw new TypeError(`$.reflectionBudget.${key} must be boolean.`);
    }
  }
  return Object.freeze({
    environment: budget.environment,
    screenSpace: budget.screenSpace
  });
}

function freezeSurfaceEffectBudget(
  budget: Readonly<WaterSurfaceEffectQualityBudgetV2> | undefined,
  surfaceShading: WaterQualityLevelV2
): Readonly<WaterSurfaceEffectQualityBudgetV2> {
  const caustics = budget?.caustics ?? surfaceShading !== "low";
  if (typeof caustics !== "boolean") throw new TypeError("$.surfaceEffectBudget.caustics must be boolean.");
  return Object.freeze({ caustics });
}

/** Sole Look-intent × Quality-budget resolution for the caustics effect. */
export function resolveEffectiveWaterCausticsEnabled(
  lookIntent: boolean,
  qualityPlan: Pick<WaterQualityPlanV2, "surfaceEffectBudget">
): boolean {
  return lookIntent && qualityPlan.surfaceEffectBudget.caustics;
}

function reflectionModeWithinBudget(
  mode: WaterReflectionPolicyMode,
  budget: Readonly<WaterReflectionQualityBudgetV2>
): boolean {
  switch (mode) {
    case "analytic":
      return true;
    case "environment":
      return budget.environment;
    case "ssr":
      return budget.screenSpace;
  }
}

/** Derives one runtime policy without introducing an independent source choice. */
export function resolveWaterReflectionPolicyForQuality(
  policy: Readonly<WaterReflectionPolicy>,
  budget: Readonly<WaterReflectionQualityBudgetV2>
): Readonly<WaterReflectionPolicy> {
  const normalizedPolicy = normalizeWaterReflectionPolicy(policy);
  const normalizedBudget = freezeReflectionBudget(budget);
  const sourceChain = waterReflectionPolicySourceChain(normalizedPolicy).filter((mode) =>
    reflectionModeWithinBudget(mode, normalizedBudget)
  );
  if (sourceChain.length === 0) sourceChain.push("analytic");
  const preferred = sourceChain[0];
  return normalizeWaterReflectionPolicy({
    preferred,
    fallbacks: sourceChain.slice(1)
  });
}

function requireFiniteNonNegative(value: number, path: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${path} must be finite and non-negative.`);
  return value;
}

function freezeSpatialFieldBudget(
  budget: Readonly<WaterSpatialFieldQualityBudgetV1>
): Readonly<WaterSpatialFieldQualityBudgetV1> {
  const maximumAtlasPixels = requireFiniteNonNegative(budget.maximumAtlasPixels, "$.spatialField.maximumAtlasPixels");
  if (!Number.isSafeInteger(maximumAtlasPixels)) {
    throw new RangeError("$.spatialField.maximumAtlasPixels must be a safe integer.");
  }
  return Object.freeze({
    maximumHorizontalError: requireFiniteNonNegative(
      budget.maximumHorizontalError,
      "$.spatialField.maximumHorizontalError"
    ),
    maximumDepthError: requireFiniteNonNegative(budget.maximumDepthError, "$.spatialField.maximumDepthError"),
    maximumGpuDepthDecodeError: requireFiniteNonNegative(
      budget.maximumGpuDepthDecodeError,
      "$.spatialField.maximumGpuDepthDecodeError"
    ),
    maximumGpuShoreDecodeError: requireFiniteNonNegative(
      budget.maximumGpuShoreDecodeError,
      "$.spatialField.maximumGpuShoreDecodeError"
    ),
    maximumAtlasPixels
  });
}

function freezeBackendBudgets(
  budgets: Readonly<WaterBackendQualityBudgetsV1> | undefined
): Readonly<WaterBackendQualityBudgetsV1> | undefined {
  if (!budgets) return undefined;
  if (typeof budgets !== "object") throw new TypeError("$.backendBudgets must be an object.");
  if (!budgets.ocean) return Object.freeze({});
  const positiveInteger = (value: number | undefined, path: string, maximum: number): number | undefined => {
    if (value === undefined) return undefined;
    if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${path} must be a positive integer.`);
    if (value > maximum) throw new RangeError(`${path} must not exceed ${maximum}.`);
    return value;
  };
  const positiveFinite = (value: number | undefined, path: string, maximum: number): number | undefined => {
    if (value === undefined) return undefined;
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${path} must be finite and positive.`);
    if (value > maximum) throw new RangeError(`${path} must not exceed ${maximum}.`);
    return value;
  };
  return Object.freeze({
    ocean: Object.freeze({
      finitePatchSegments: positiveInteger(
        budgets.ocean.finitePatchSegments,
        "$.backendBudgets.ocean.finitePatchSegments",
        WATER_OCEAN_MAX_FINITE_PATCH_SEGMENTS
      ),
      fixedLodRingPatchSegments: positiveInteger(
        budgets.ocean.fixedLodRingPatchSegments,
        "$.backendBudgets.ocean.fixedLodRingPatchSegments",
        WATER_OCEAN_MAX_RING_PATCH_SEGMENTS
      ),
      fixedLodCentralPatchSegments: positiveInteger(
        budgets.ocean.fixedLodCentralPatchSegments,
        "$.backendBudgets.ocean.fixedLodCentralPatchSegments",
        WATER_OCEAN_MAX_CENTRAL_PATCH_SEGMENTS
      ),
      fixedLodFirstRingPatchSegments: positiveInteger(
        budgets.ocean.fixedLodFirstRingPatchSegments,
        "$.backendBudgets.ocean.fixedLodFirstRingPatchSegments",
        WATER_OCEAN_MAX_RING_PATCH_SEGMENTS
      ),
      nearshoreFixedStepRateHz: positiveFinite(
        budgets.ocean.nearshoreFixedStepRateHz,
        "$.backendBudgets.ocean.nearshoreFixedStepRateHz",
        WATER_OCEAN_MAX_NEARSHORE_FIXED_STEP_RATE_HZ
      ),
      nearshoreMaximumSeekSeconds: positiveFinite(
        budgets.ocean.nearshoreMaximumSeekSeconds,
        "$.backendBudgets.ocean.nearshoreMaximumSeekSeconds",
        WATER_OCEAN_MAX_NEARSHORE_SEEK_SECONDS
      ),
      windResponseFixedStepRateHz: positiveFinite(
        budgets.ocean.windResponseFixedStepRateHz,
        "$.backendBudgets.ocean.windResponseFixedStepRateHz",
        WATER_OCEAN_MAX_WIND_RESPONSE_FIXED_STEP_RATE_HZ
      ),
      windResponseMaximumCatchUpSteps: positiveInteger(
        budgets.ocean.windResponseMaximumCatchUpSteps,
        "$.backendBudgets.ocean.windResponseMaximumCatchUpSteps",
        WATER_OCEAN_MAX_WIND_RESPONSE_CATCH_UP_STEPS
      )
    })
  });
}

export function createWaterQualityPlanV2(source: Readonly<WaterQualityPlanInputV2>): Readonly<WaterQualityPlanV2> {
  if ("simulation" in source) {
    throw new TypeError(
      "Water Quality Plan simulation is not public until a backend workload contract is implemented."
    );
  }
  if (typeof source.id !== "string" || source.id.trim().length === 0) {
    throw new TypeError("Water Quality Plan id must be non-empty.");
  }
  if (!LEVELS.includes(source.geometry)) throw new TypeError(`Unsupported geometry quality '${source.geometry}'.`);
  if (!LEVELS.includes(source.surfaceShading)) {
    throw new TypeError(`Unsupported surface shading quality '${source.surfaceShading}'.`);
  }
  if (!SCENE_FIELDS.includes(source.sceneFields)) {
    throw new TypeError(`Unsupported scene-fields quality '${source.sceneFields}'.`);
  }
  if (source.opaqueDownsampling !== undefined && !OPAQUE_DOWNSAMPLING.includes(source.opaqueDownsampling)) {
    throw new TypeError(`Unsupported opaque downsampling '${source.opaqueDownsampling}'.`);
  }
  if (!QUERIES.includes(source.query)) throw new TypeError(`Unsupported query quality '${source.query}'.`);
  return Object.freeze({
    schemaVersion: WATER_QUALITY_PLAN_SCHEMA_VERSION,
    id: source.id,
    geometry: source.geometry,
    surfaceShading: source.surfaceShading,
    sceneFields: source.sceneFields,
    ...(source.opaqueDownsampling !== undefined ? { opaqueDownsampling: source.opaqueDownsampling } : {}),
    reflectionBudget: freezeReflectionBudget(source.reflectionBudget),
    surfaceEffectBudget: freezeSurfaceEffectBudget(source.surfaceEffectBudget, source.surfaceShading),
    query: source.query,
    spatialField: freezeSpatialFieldBudget(source.spatialField),
    backendBudgets: freezeBackendBudgets(source.backendBudgets)
  });
}

export function computeWaterQualityPlanContentHash(plan: Readonly<WaterQualityPlanV2>): string {
  return hashStableValue(plan);
}
