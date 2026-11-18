/** Immutable bundle of reusable Water appearance, optics, reflection, and render-state identities. */
import { resolveWaterContactEffectsLook, type WaterContactEffectsLook } from "../effects/WaterContactEffectsLook";
import { resolveRiverDropLook, type RiverDropLook } from "../river/RiverDropLook";
import {
  DEFAULT_WATER_REFLECTION_SAMPLING_SETTINGS,
  resolveWaterReflectionSamplingSettings,
  type WaterReflectionSamplingConfig,
  type WaterReflectionSamplingSettings
} from "../optics/WaterReflectionSampling";
import {
  createWaterLookEnvironmentResponseV2,
  NEUTRAL_WATER_LOOK_ENVIRONMENT_RESPONSE,
  type WaterLookEnvironmentResponseInputV2,
  type WaterLookEnvironmentResponseV2
} from "./WaterLookEnvironmentResponse";

export const WATER_LOOK_PRESET_SCHEMA_VERSION = 1 as const;

export interface WaterLookFoamV1 {
  readonly enabled: boolean;
  readonly intensity: number;
  readonly color: string;
  readonly sourceTuning?: Readonly<WaterLookFoamSourceTuningV1>;
}

export interface WaterLookFoamSourceTuningV1 {
  readonly breakerIntensity?: number;
  readonly breakerMinimumActivation?: number;
  readonly breakerFullActivation?: number;
  readonly shoreIntensity?: number;
  readonly shoreBandWidth?: number;
  readonly shoreSeawardOffset?: number;
}

export interface WaterLookOceanMicroDetailResponseKnotV1 {
  readonly speedMetresPerSecond: number;
  readonly strengthRatio: number;
  readonly speedRatio: number;
}

export interface WaterLookOceanResponseV1 {
  readonly timeScale: number;
  readonly microDetailResponse: readonly WaterLookOceanMicroDetailResponseKnotV1[];
}

export const NEUTRAL_WATER_LOOK_OCEAN_RESPONSE: Readonly<WaterLookOceanResponseV1> = Object.freeze({
  timeScale: 1,
  microDetailResponse: Object.freeze([
    Object.freeze({ speedMetresPerSecond: 0, strengthRatio: 1, speedRatio: 1 }),
    Object.freeze({ speedMetresPerSecond: 100, strengthRatio: 1, speedRatio: 1 })
  ])
});

export const NEUTRAL_WATER_LOOK_FOAM: Readonly<WaterLookFoamV1> = Object.freeze({
  enabled: false,
  intensity: 0,
  color: "#ffffff"
});

export const DEFAULT_WATER_LOOK_RUNTIME_INPUT = Object.freeze({
  reflectionSampling: DEFAULT_WATER_REFLECTION_SAMPLING_SETTINGS,
  environmentResponse: NEUTRAL_WATER_LOOK_ENVIRONMENT_RESPONSE,
  oceanResponse: NEUTRAL_WATER_LOOK_OCEAN_RESPONSE,
  foam: NEUTRAL_WATER_LOOK_FOAM
});

export interface WaterLookPresetV1 {
  readonly schemaVersion: typeof WATER_LOOK_PRESET_SCHEMA_VERSION;
  readonly id: string;
  readonly appearanceAssetId: string;
  readonly opticalProfileId: string;
  readonly reflectionPolicyId: string;
  readonly renderStatePresetId: string;
  readonly reflectionSampling: Readonly<WaterReflectionSamplingSettings>;
  readonly environmentResponse: Readonly<WaterLookEnvironmentResponseV2>;
  readonly oceanResponse: Readonly<WaterLookOceanResponseV1>;
  readonly foam: Readonly<WaterLookFoamV1>;
  readonly contactEffects?: WaterContactEffectsLook;
  readonly riverDrops?: Readonly<RiverDropLook>;
}

export interface WaterLookPresetInputV1
  extends Omit<
    WaterLookPresetV1,
    "schemaVersion" | "reflectionSampling" | "environmentResponse" | "oceanResponse" | "foam"
  > {
  readonly reflectionSampling: Readonly<WaterReflectionSamplingConfig>;
  readonly environmentResponse: Readonly<WaterLookEnvironmentResponseInputV2>;
  readonly oceanResponse?: Readonly<WaterLookOceanResponseV1>;
  readonly foam?: Readonly<WaterLookFoamV1>;
}

function requireId(value: string, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${path} must be a non-empty id.`);
  }
  return value;
}

function resolveWaterLookFoam(source: Readonly<WaterLookFoamV1> | undefined): Readonly<WaterLookFoamV1> {
  const enabled = source?.enabled ?? false;
  const intensity = source?.intensity ?? 0;
  const color = source?.color ?? "#ffffff";
  if (typeof enabled !== "boolean") {
    throw new TypeError("Water Look foam.enabled must be a boolean.");
  }
  if (!Number.isFinite(intensity) || intensity < 0 || intensity > 8) {
    throw new RangeError("Water Look foam.intensity must be finite and within [0, 8].");
  }
  if (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color)) {
    throw new RangeError("Water Look foam.color must use #RRGGBB.");
  }
  const sourceTuning = source?.sourceTuning
    ? Object.freeze(
        Object.fromEntries(
          Object.entries(source.sourceTuning).map(([key, value]) => {
            if (!Number.isFinite(value) || (value as number) < 0) {
              throw new RangeError(`Water Look foam.sourceTuning.${key} must be finite and non-negative.`);
            }
            return [key, value];
          })
        ) as unknown as WaterLookFoamSourceTuningV1
      )
    : undefined;
  return Object.freeze({ enabled, intensity, color: color.toLowerCase(), sourceTuning });
}

function resolveWaterLookOceanResponse(
  source: Readonly<WaterLookOceanResponseV1> | undefined
): Readonly<WaterLookOceanResponseV1> {
  const response = source ?? NEUTRAL_WATER_LOOK_OCEAN_RESPONSE;
  if (!Number.isFinite(response.timeScale) || response.timeScale < 0.1 || response.timeScale > 4) {
    throw new RangeError("Water Look oceanResponse.timeScale must be within [0.1, 4].");
  }
  if (!Array.isArray(response.microDetailResponse) || response.microDetailResponse.length < 2) {
    throw new RangeError("Water Look oceanResponse.microDetailResponse requires at least two knots.");
  }
  let previousSpeed = -1;
  const microDetailResponse = response.microDetailResponse.map((knot, index) => {
    if (
      !Number.isFinite(knot.speedMetresPerSecond) ||
      knot.speedMetresPerSecond < 0 ||
      knot.speedMetresPerSecond <= previousSpeed ||
      !Number.isFinite(knot.strengthRatio) ||
      knot.strengthRatio < 0 ||
      !Number.isFinite(knot.speedRatio) ||
      knot.speedRatio < 0
    ) {
      throw new RangeError(`Water Look oceanResponse.microDetailResponse[${index}] is invalid.`);
    }
    previousSpeed = knot.speedMetresPerSecond;
    return Object.freeze({ ...knot });
  });
  return Object.freeze({ timeScale: response.timeScale, microDetailResponse: Object.freeze(microDetailResponse) });
}

export function createWaterLookPresetV1(source: Readonly<WaterLookPresetInputV1>): Readonly<WaterLookPresetV1> {
  return Object.freeze({
    schemaVersion: WATER_LOOK_PRESET_SCHEMA_VERSION,
    id: requireId(source.id, "Water Look id"),
    appearanceAssetId: requireId(source.appearanceAssetId, "Water Look appearanceAssetId"),
    opticalProfileId: requireId(source.opticalProfileId, "Water Look opticalProfileId"),
    reflectionPolicyId: requireId(source.reflectionPolicyId, "Water Look reflectionPolicyId"),
    renderStatePresetId: requireId(source.renderStatePresetId, "Water Look renderStatePresetId"),
    reflectionSampling: resolveWaterReflectionSamplingSettings(source.reflectionSampling),
    environmentResponse: createWaterLookEnvironmentResponseV2(source.environmentResponse),
    oceanResponse: resolveWaterLookOceanResponse(source.oceanResponse),
    ...(source.contactEffects === undefined
      ? {}
      : { contactEffects: resolveWaterContactEffectsLook(source.contactEffects) }),
    ...(source.riverDrops === undefined ? {} : { riverDrops: resolveRiverDropLook(source.riverDrops) }),
    foam: resolveWaterLookFoam(source.foam)
  });
}
