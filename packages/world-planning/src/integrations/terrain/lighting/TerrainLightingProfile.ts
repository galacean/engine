import type { TerrainLightingVisualTuning, TerrainTimeOfDayLightingSample } from "./TerrainLightingRuntime.ts";

/** One reusable lighting asset owns both the circular day curve and the unanimated sky settings. */
export interface TerrainLightingProfileData {
  readonly version: 1;
  readonly samples: readonly TerrainTimeOfDayLightingSample[];
  readonly visualTuning: TerrainLightingProfileStaticTuning;
}
export type TerrainLightingProfileStaticTuning = Omit<
  TerrainLightingVisualTuning,
  keyof TerrainTimeOfDayLightingSample | "fogMode" | "fogExponent"
>;

/** The definition module, not the active demo URL, anchors the shared resource path. */
export const INTEGRATED_WORLD_LIGHTING_PROFILE_URL = new URL(
  "../../../../../environment/src/terrain/lighting/IntegratedWorldLightingProfile.json",
  import.meta.url
).href;
/** Seed's existing fog/shadow calibration is authored in its asset, never hidden in schema defaults. */
export const SEED_WORLD_LIGHTING_PROFILE_URL = new URL(
  "../../../../../environment/src/terrain/lighting/SeedWorldLightingProfile.json",
  import.meta.url
).href;

// Exhaustive field maps make interface changes require a corresponding serialized-contract update.
const sampleFields: Record<keyof TerrainTimeOfDayLightingSample, true> = {
  timeHours: true,
  sunIntensity: true,
  shadowStrength: true,
  sunColorR: true,
  sunColorG: true,
  sunColorB: true,
  ambientIntensity: true,
  iblIntensity: true,
  sunSize: true,
  sunSizeConvergence: true,
  starIntensity: true,
  moonLightIntensity: true,
  twilightIntensity: true,
  airglowIntensity: true,
  skyExposure: true,
  atmosphereThickness: true,
  atmosphereHeight: true,
  observerHeight: true,
  rayleighScattering: true,
  rayleighScaleHeight: true,
  mieScattering: true,
  mieScaleHeight: true,
  mieAnisotropy: true,
  scatteringIntensity: true,
  horizonHaze: true,
  atmosphereSampleCount: true,
  skyTintR: true,
  skyTintG: true,
  skyTintB: true,
  groundTintR: true,
  groundTintG: true,
  groundTintB: true,
  customSkyTintStrength: true,
  customSkyZenithR: true,
  customSkyZenithG: true,
  customSkyZenithB: true,
  customSkyHorizonR: true,
  customSkyHorizonG: true,
  customSkyHorizonB: true,
  fogStart: true,
  fogEnd: true,
  fogDensity: true,
  fogRadianceIntensity: true,
  fogTintR: true,
  fogTintG: true,
  fogTintB: true,
  exposureCompensation: true,
  bloomThreshold: true,
  bloomIntensity: true
};
const staticFields: Record<keyof TerrainLightingProfileStaticTuning, true> = {
  starSize: true,
  starCount: true,
  starTwinkleIntensity: true,
  starTwinkleSpeed: true,
  moonColorR: true,
  moonColorG: true,
  moonColorB: true,
  moonDiskIntensity: true,
  moonAtmosphereIntensityScale: true,
  moonAngularScale: true
};

/** Reject incomplete assets before mutating a live lighting owner. Returned values do not alias JSONAsset.data. */
export function decodeTerrainLightingProfile(value: unknown): TerrainLightingProfileData {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.samples) || value.samples.length < 2)
    throw new Error("Lighting profile requires version 1 and at least two time samples");
  const samples = value.samples
    .map((sample, index) => {
      const fields = readFields(sample, sampleFields, `samples[${index}]`);
      if (fields.timeHours < 0 || fields.timeHours >= 24)
        throw new Error("Lighting profile sample hours must be within [0, 24)");
      if (fields.fogEnd <= fields.fogStart) throw new Error("Lighting profile fog end must be greater than fog start");
      return Object.freeze(fields);
    })
    .sort((left, right) => left.timeHours - right.timeHours);
  // Runtime closes the circular curve by repeating samples[0] at time=1, so it requires a midnight anchor.
  if (samples[0].timeHours !== 0 || new Set(samples.map((sample) => sample.timeHours)).size !== samples.length)
    throw new Error("Lighting profile requires unique sample hours and a midnight sample");
  return Object.freeze({
    version: 1,
    samples: Object.freeze(samples),
    visualTuning: Object.freeze(readFields(value.visualTuning, staticFields, "visualTuning"))
  });
}

/** The native profile closes midnight at 24h and linearly interpolates authored scalar/color keys. */
export function sampleTerrainLightingProfile(
  profile: TerrainLightingProfileData,
  timeHours: number,
  fields: readonly string[]
): Record<string, number> {
  if (!Number.isFinite(timeHours)) throw new Error("Lighting profile time must be finite");
  const time = ((timeHours % 24) + 24) % 24;
  const samples = profile.samples;
  const nextIndex = samples.findIndex((sample) => sample.timeHours > time);
  const left = nextIndex < 0 ? samples[samples.length - 1] : samples[nextIndex - 1];
  const right = nextIndex < 0 ? samples[0] : samples[nextIndex];
  const end = nextIndex < 0 ? 24 : right.timeHours;
  const factor = (time - left.timeHours) / (end - left.timeHours);
  return Object.fromEntries(
    fields
      .filter((field) => field !== "timeHours" && Object.hasOwn(sampleFields, field))
      .map((field) => {
        const key = field as keyof TerrainTimeOfDayLightingSample;
        return [field, left[key] + (right[key] - left[key]) * factor];
      })
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function readFields<K extends string>(value: unknown, fields: Record<K, true>, path: string): Record<K, number> {
  if (!isRecord(value)) throw new Error(`Lighting profile ${path} must be an object`);
  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(fields, key)) throw new Error(`Unknown lighting profile field ${path}.${key}`);
  }
  const result = {} as Record<K, number>;
  for (const key of Object.keys(fields) as K[]) {
    const number = value[key];
    if (typeof number !== "number" || !Number.isFinite(number) || (key !== "exposureCompensation" && number < 0))
      throw new Error(`Invalid lighting profile field ${path}.${key}`);
    result[key] = number;
  }
  return result;
}
