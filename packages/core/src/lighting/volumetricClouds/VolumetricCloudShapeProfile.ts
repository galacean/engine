/** Stratus, cumulus and cumulonimbus gradient controls stored along the texture width. */
export const VOLUMETRIC_CLOUD_SHAPE_PROFILE_WIDTH = 3;
/** One RGBA row stores each profile's four height-gradient control points. */
export const VOLUMETRIC_CLOUD_SHAPE_PROFILE_HEIGHT = 1;

/** Enviro height-gradient controls: bottom start/end followed by top start/end. */
export interface VolumetricCloudShapeDefinition {
  readonly bottomStart: number;
  readonly bottomEnd: number;
  readonly topStart: number;
  readonly topEnd: number;
}

/** Artist-authored density-shaping parameters independent from the horizontal Weather Map. */
export interface VolumetricCloudShapeSettings {
  readonly bottomShape: number;
  readonly middleShape: number;
  readonly topShape: number;
  readonly rampShape: number;
  readonly cloudTypeShaping: number;
  readonly baseErosionIntensity: number;
  readonly baseNoiseMultiplier: number;
  readonly detailErosionScale: number;
  readonly maxDetailErosion: number;
  readonly detailNoiseMultiplier: number;
  readonly curlIntensity: number;
  readonly topDensityMultiplier: number;
  /** Horizontal displacement at the cloud top as a multiple of layer thickness. */
  readonly topSkewRatio: number;
  /** Bias applied before mapping Weather Map cloud type into the profile texture. */
  readonly profileTypeOffset: number;
  readonly bottomBandStart: number;
  readonly bottomBandEnd: number;
  readonly middleBandStart: number;
  readonly middleBandEnd: number;
  readonly topBandStart: number;
  readonly topBandEnd: number;
  readonly envelopeScale: number;
  readonly bottomFadeExponent: number;
  readonly bottomFadeStrength: number;
  readonly topFadeExponent: number;
  readonly topFadeStrength: number;
  readonly topCutoff: number;
  readonly detailAnimationSpeed: number;
  readonly detailCurlFrequency: number;
  readonly detailCurlBlend: number;
  readonly detailCurlExponent: number;
  readonly detailVerticalCurlStrength: number;
  readonly detailLodNearDistance: number;
  readonly detailLodFarDistance: number;
  readonly detailHeightErosionScale: number;
}

/** Shape defaults authored from Enviro 3's Cloudy 1 profile. */
export const VOLUMETRIC_CLOUD_DEFAULT_SHAPE_SETTINGS: Readonly<VolumetricCloudShapeSettings> = Object.freeze({
  bottomShape: -0.1,
  middleShape: -1.48,
  topShape: -4.35,
  rampShape: 0.85,
  cloudTypeShaping: 0.595,
  baseErosionIntensity: 0.067,
  baseNoiseMultiplier: 1.1,
  detailErosionScale: 0.5,
  maxDetailErosion: 0.5,
  detailNoiseMultiplier: 1,
  curlIntensity: 0.757,
  topDensityMultiplier: 0.2,
  topSkewRatio: 1 / 6,
  profileTypeOffset: 0.1,
  bottomBandStart: -0.1,
  bottomBandEnd: 0.25,
  middleBandStart: 0.2,
  middleBandEnd: 0.45,
  topBandStart: 0.4,
  topBandEnd: 0.8,
  envelopeScale: 0.5,
  bottomFadeExponent: 8,
  bottomFadeStrength: 0.9,
  topFadeExponent: 8,
  topFadeStrength: 1.5,
  topCutoff: 0.9,
  detailAnimationSpeed: 0.0035,
  detailCurlFrequency: 3,
  detailCurlBlend: 0.5,
  detailCurlExponent: 0.15,
  detailVerticalCurlStrength: 0.5,
  detailLodNearDistance: 8,
  detailLodFarDistance: 72,
  detailHeightErosionScale: 10
});

const STRATUS_PROFILE = shape(0, 0.07, 0.08, 0.15);
const CUMULUS_PROFILE = shape(0, 0.2, 0.42, 0.6);
const CUMULONIMBUS_PROFILE = shape(0, 0.08, 0.75, 0.98);

export const VOLUMETRIC_CLOUD_DEFAULT_SHAPE_DEFINITIONS: readonly VolumetricCloudShapeDefinition[] = Object.freeze([
  STRATUS_PROFILE,
  CUMULUS_PROFILE,
  CUMULONIMBUS_PROFILE
]);

/**
 * Vertical cloud morphology profile. It owns height gradients and density-shaping values,
 * while the Weather Map remains responsible only for horizontal distribution.
 */
export class VolumetricCloudShapeProfile {
  readonly pixels = new Uint8Array(VOLUMETRIC_CLOUD_SHAPE_PROFILE_WIDTH * VOLUMETRIC_CLOUD_SHAPE_PROFILE_HEIGHT * 4);
  readonly definitions: readonly VolumetricCloudShapeDefinition[];
  readonly settings: Readonly<VolumetricCloudShapeSettings>;

  constructor(
    definitions: readonly VolumetricCloudShapeDefinition[] = VOLUMETRIC_CLOUD_DEFAULT_SHAPE_DEFINITIONS,
    settings: Readonly<VolumetricCloudShapeSettings> = VOLUMETRIC_CLOUD_DEFAULT_SHAPE_SETTINGS
  ) {
    if (definitions.length !== VOLUMETRIC_CLOUD_SHAPE_PROFILE_WIDTH) {
      throw new RangeError(
        `Volumetric cloud shape profile requires ${VOLUMETRIC_CLOUD_SHAPE_PROFILE_WIDTH} definitions`
      );
    }
    this.definitions = Object.freeze(definitions.map(validateShapeDefinition));
    this.settings = createVolumetricCloudShapeSettings(settings);
    for (let index = 0; index < this.definitions.length; index++) {
      const definition = this.definitions[index];
      const destination = index * 4;
      this.pixels[destination] = encode(definition.bottomStart);
      this.pixels[destination + 1] = encode(definition.bottomEnd);
      this.pixels[destination + 2] = encode(definition.topStart);
      this.pixels[destination + 3] = encode(definition.topEnd);
    }
  }

  pack(): Uint8Array {
    return this.pixels.slice();
  }
}

/** Evaluate the same filtered height profile represented by the GPU lookup texture. */
export function evaluateVolumetricCloudShapeProfile(
  height: number,
  cloudType: number,
  definitions: readonly VolumetricCloudShapeDefinition[] = VOLUMETRIC_CLOUD_DEFAULT_SHAPE_DEFINITIONS,
  settings: Readonly<VolumetricCloudShapeSettings> = VOLUMETRIC_CLOUD_DEFAULT_SHAPE_SETTINGS
): number {
  if (definitions.length !== VOLUMETRIC_CLOUD_SHAPE_PROFILE_WIDTH) {
    throw new RangeError(`Volumetric cloud shape profile requires ${VOLUMETRIC_CLOUD_SHAPE_PROFILE_WIDTH} definitions`);
  }
  const type = clamp01(cloudType + settings.profileTypeOffset);
  const scaledType = type * (VOLUMETRIC_CLOUD_SHAPE_PROFILE_WIDTH - 1);
  const lowerIndex = Math.floor(scaledType);
  const upperIndex = Math.min(lowerIndex + 1, definitions.length - 1);
  const blend = scaledType - lowerIndex;
  const lower = definitions[lowerIndex];
  const upper = definitions[upperIndex];
  const bottomStart = mix(lower.bottomStart, upper.bottomStart, blend);
  const bottomEnd = mix(lower.bottomEnd, upper.bottomEnd, blend);
  const topStart = mix(lower.topStart, upper.topStart, blend);
  const topEnd = mix(lower.topEnd, upper.topEnd, blend);
  const clampedHeight = clamp01(height);
  return smoothstep(bottomStart, bottomEnd, clampedHeight) - smoothstep(topStart, topEnd, clampedHeight);
}

function shape(
  bottomStart: number,
  bottomEnd: number,
  topStart: number,
  topEnd: number
): VolumetricCloudShapeDefinition {
  return Object.freeze({ bottomStart, bottomEnd, topStart, topEnd });
}

function validateShapeDefinition(definition: VolumetricCloudShapeDefinition): VolumetricCloudShapeDefinition {
  const values = [definition.bottomStart, definition.bottomEnd, definition.topStart, definition.topEnd];
  if (
    values.some((value) => !Number.isFinite(value) || value < 0 || value > 1) ||
    definition.bottomStart > definition.bottomEnd ||
    definition.bottomEnd > definition.topStart ||
    definition.topStart > definition.topEnd
  ) {
    throw new RangeError("Volumetric cloud shape gradient controls must be ordered values in [0, 1]");
  }
  return Object.freeze({ ...definition });
}

/** Validate and detach artist-authored morphology data. */
export function createVolumetricCloudShapeSettings(
  settings: Readonly<VolumetricCloudShapeSettings>
): Readonly<VolumetricCloudShapeSettings> {
  for (const [name, value] of Object.entries(settings)) {
    if (!Number.isFinite(value)) throw new RangeError(`Volumetric cloud shape ${name} must be finite`);
  }
  if (
    settings.rampShape <= 0 ||
    settings.cloudTypeShaping < 0 ||
    settings.cloudTypeShaping > 1 ||
    settings.baseErosionIntensity < 0 ||
    settings.baseErosionIntensity > 1 ||
    settings.baseNoiseMultiplier <= 0 ||
    settings.detailErosionScale < 0 ||
    settings.maxDetailErosion < 0 ||
    settings.maxDetailErosion > 1 ||
    settings.detailNoiseMultiplier <= 0 ||
    settings.curlIntensity < 0 ||
    settings.topDensityMultiplier < 0 ||
    settings.topDensityMultiplier > 1 ||
    settings.topSkewRatio < 0 ||
    settings.bottomBandStart >= settings.bottomBandEnd ||
    settings.middleBandStart >= settings.middleBandEnd ||
    settings.topBandStart >= settings.topBandEnd ||
    settings.envelopeScale < 0 ||
    settings.bottomFadeExponent <= 0 ||
    settings.bottomFadeStrength < 0 ||
    settings.topFadeExponent <= 0 ||
    settings.topFadeStrength < 0 ||
    settings.topCutoff <= 0 ||
    settings.topCutoff > 1 ||
    settings.detailAnimationSpeed < 0 ||
    settings.detailCurlFrequency <= 0 ||
    settings.detailCurlBlend < 0 ||
    settings.detailCurlBlend > 1 ||
    settings.detailCurlExponent <= 0 ||
    settings.detailVerticalCurlStrength < 0 ||
    settings.detailLodNearDistance < 0 ||
    settings.detailLodFarDistance <= settings.detailLodNearDistance ||
    settings.detailHeightErosionScale <= 0
  ) {
    throw new RangeError("Volumetric cloud shape settings are outside their supported ranges");
  }
  return Object.freeze({ ...settings });
}

function encode(value: number): number {
  return Math.round(value * 255);
}

function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function smoothstep(minimum: number, maximum: number, value: number): number {
  const linear = clamp01((value - minimum) / Math.max(maximum - minimum, Number.EPSILON));
  return linear * linear * (3 - 2 * linear);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
