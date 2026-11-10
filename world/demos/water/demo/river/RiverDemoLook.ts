import type { WaterLookAuthoringDraft, WaterLookAuthoringSnapshot } from "@galacean/engine-water/water/index";
import {
  resolveWaterContactEffectsLook,
  type WaterContactEffectsLook,
  WaterSurfaceDepthResponseModelV2
} from "@galacean/engine-water/water/index";

import {
  resolveWaterIndexOfRefraction,
  resolveWaterReflectionIntensity,
  resolveWaterRefractionStrength,
  resolveWaterRoughness
} from "@galacean/engine-water/water/runtime/index";

export interface RiverDemoLook {
  absorption: [number, number, number];

  shallowColor: [number, number, number];
  deepColor: [number, number, number];

  indexOfRefraction: number;
  refractionStrength: number;
  roughness: number;
  flowNormalStrength: number;
  reflectionIntensity: number;
  directSpecular: boolean;
  reflection: "ssr" | "environment" | "analytic";
  foamEnabled: boolean;
  foamIntensity: number;
  contactEffects?: WaterContactEffectsLook;
}
const RIVER_DEMO_LOOK_KEYS = new Set<keyof RiverDemoLook>([
  "absorption",

  "shallowColor",
  "deepColor",

  "indexOfRefraction",
  "refractionStrength",
  "roughness",
  "flowNormalStrength",
  "reflectionIntensity",
  "directSpecular",
  "reflection",
  "foamEnabled",
  "foamIntensity",
  "contactEffects"
]);

/** Read editable values from authoring; the demo does not maintain another preset. */
export function readRiverDemoLook(snapshot: Readonly<WaterLookAuthoringSnapshot>): RiverDemoLook {
  const { appearance, featureFlags } = snapshot.appearance;
  const { depthResponse } = appearance;
  const profile = snapshot.optics.profile;
  if (depthResponse.model !== WaterSurfaceDepthResponseModelV2.BeerLambert || !depthResponse.scatteringTint) {
    throw new Error("River High requires a depth color palette.");
  }
  return validateRiverDemoLook({
    absorption: [...profile.absorptionCoefficient],

    shallowColor: depthResponse.scatteringTint.shallowColor.slice(0, 3),
    deepColor: depthResponse.scatteringTint.deepColor.slice(0, 3),

    indexOfRefraction: resolveWaterIndexOfRefraction(profile.indexOfRefraction),
    refractionStrength: resolveWaterRefractionStrength(profile.refractionStrength),
    roughness: resolveWaterRoughness(profile.roughness),
    flowNormalStrength: appearance.flowNormalStrength,
    reflectionIntensity: resolveWaterReflectionIntensity(profile.reflectionIntensity),
    directSpecular: featureFlags?.directSpecular !== false,
    reflection: snapshot.reflectionPolicy.policy.preferred,
    foamEnabled: snapshot.look.foam.enabled,
    foamIntensity: snapshot.look.foam.intensity,
    ...(snapshot.look.contactEffects ? { contactEffects: snapshot.look.contactEffects } : {})
  });
}

/** Validate the complete candidate before publishing; never partially accept an imported Look. */
export function validateRiverDemoLook(input: unknown): RiverDemoLook {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("外观必须是对象。");
  const value = input as Record<string, unknown>;
  for (const key of Object.keys(value))
    if (!RIVER_DEMO_LOOK_KEYS.has(key as keyof RiverDemoLook)) throw new TypeError(`未知外观参数：${key}`);
  const finite = (key: string, minimum: number, maximum: number) => {
    const number = value[key];
    if (typeof number !== "number" || !Number.isFinite(number) || number < minimum || number > maximum)
      throw new RangeError(`${key} 必须位于 ${minimum} 到 ${maximum}。`);
    return number;
  };
  const rgb = (key: string, maximum: number): [number, number, number] => {
    const array = value[key];
    if (
      !Array.isArray(array) ||
      array.length !== 3 ||
      [0, 1, 2].some(
        (i) => typeof array[i] !== "number" || !Number.isFinite(array[i]) || array[i] < 0 || array[i] > maximum
      )
    )
      throw new TypeError(`${key} 需要三个有效的线性 RGB 分量。`);
    return [...array] as [number, number, number];
  };
  if (typeof value.foamEnabled !== "boolean" || typeof value.directSpecular !== "boolean")
    throw new TypeError("泡沫和高光开关必须为布尔值。");
  if (value.reflection !== "ssr" && value.reflection !== "environment" && value.reflection !== "analytic")
    throw new TypeError("未知反射策略。");
  const contactEffects =
    value.contactEffects === undefined ? undefined : resolveWaterContactEffectsLook(value.contactEffects);
  // This demo has a closed asset catalog; reject unsupported resource/atlas pairs before publishing.
  if (contactEffects)
    for (const style of Object.values(contactEffects)) {
      const grids: Record<string, number> = {
        "WaterSplash_6x6.png": 6,
        "WaterMist_5x5.png": 5,
        "WaterfallSplash_5x5.png": 5
      };
      if (grids[style.textureId] !== style.atlasColumns || grids[style.textureId] !== style.atlasRows)
        throw new RangeError("未知水特效素材或图集尺寸。");
    }
  return {
    ...(contactEffects ? { contactEffects } : {}),
    absorption: rgb("absorption", 1000),

    shallowColor: rgb("shallowColor", 1),
    deepColor: rgb("deepColor", 1),

    indexOfRefraction: finite("indexOfRefraction", 1, 4),
    refractionStrength: finite("refractionStrength", 0, 4),
    roughness: finite("roughness", 0, 1),
    flowNormalStrength: finite("flowNormalStrength", 0, 1),
    reflectionIntensity: finite("reflectionIntensity", 0, 4),
    foamIntensity: finite("foamIntensity", 0, 4),
    foamEnabled: value.foamEnabled,
    directSpecular: value.directSpecular,
    reflection: value.reflection
  };
}

export function applyRiverDemoLook(
  current: Readonly<WaterLookAuthoringSnapshot>,
  look: RiverDemoLook
): WaterLookAuthoringDraft {
  const depthResponse = current.appearance.appearance.depthResponse;
  if (depthResponse.model !== WaterSurfaceDepthResponseModelV2.BeerLambert || !depthResponse.scatteringTint)
    throw new Error("River High requires Beer-Lambert optics and a scattering palette.");
  return {
    ...current,
    reflectionPolicy: {
      ...current.reflectionPolicy,
      policy: {
        preferred: look.reflection,
        fallbacks:
          look.reflection === "ssr"
            ? ["environment", "analytic"]
            : look.reflection === "environment"
              ? ["analytic"]
              : []
      }
    },
    look: {
      ...current.look,
      contactEffects: look.contactEffects,
      foam: { ...current.look.foam, enabled: look.foamEnabled, intensity: look.foamIntensity }
    },
    appearance: {
      ...current.appearance,
      featureFlags: { ...current.appearance.featureFlags, directSpecular: look.directSpecular },
      appearance: {
        ...current.appearance.appearance,
        flowNormalStrength: look.flowNormalStrength,
        depthResponse: {
          ...depthResponse,
          scatteringTint: {
            ...depthResponse.scatteringTint,
            shallowColor: [...look.shallowColor, 1],
            deepColor: [...look.deepColor, 1]
          }
        }
      }
    },
    optics: {
      ...current.optics,
      profile: {
        ...current.optics.profile,
        absorptionCoefficient: look.absorption,

        indexOfRefraction: look.indexOfRefraction,
        fresnelF0: undefined,
        refractionStrength: look.refractionStrength,
        roughness: look.roughness,
        reflectionIntensity: look.reflectionIntensity
      }
    }
  };
}
export function exportRiverDemoLook(look: RiverDemoLook): string {
  return JSON.stringify({ version: 1, preset: "river-high", look: validateRiverDemoLook(look) }, null, 2);
}
export function importRiverDemoLook(json: string): RiverDemoLook {
  const document = JSON.parse(json);
  if (document?.version !== 1 || document?.preset !== "river-high") throw new Error("不支持的 River 外观文件版本。");
  return validateRiverDemoLook(document.look);
}
