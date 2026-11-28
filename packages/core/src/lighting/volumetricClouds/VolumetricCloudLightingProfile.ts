/** Linear RGB radiance color. The render pipeline converts linear output to sRGB. */
export type VolumetricCloudLightingColor = readonly [number, number, number];
export type VolumetricCloudLightStepPattern = readonly [number, number, number, number, number, number];

/** Artist-authored optical response independent from cloud distribution and morphology. */
export interface VolumetricCloudLightingProfile {
  /** Maximum sun-ray integration distance as a multiple of cloud-layer thickness. */
  readonly lightMarchDistanceScale: number;
  /** Relative non-uniform segment lengths for the six supported sun-ray samples. */
  readonly lightStepPattern: VolumetricCloudLightStepPattern;
  /** Additional optical depth at full storm strength. */
  readonly stormExtinctionMultiplier: number;
  /** Coarse-density response used to suppress multiple scattering at exposed edges. */
  readonly inscatteringDensityScale: number;
  /** Minimum multiple-scattering energy retained at exposed edges. */
  readonly multipleScatteringMinimum: number;
  /** Final directional-scattering energy scale. */
  readonly directionalEnergyScale: number;
  /** Rational compression applied to high directional-scattering energy. */
  readonly directionalEnergyCompression: number;
  readonly ambientSkyBottom: number;
  readonly ambientSkyTop: number;
  readonly ambientGroundBottom: number;
  readonly ambientGroundTop: number;
  readonly powderDensityScale: number;
  readonly powderDirectMinimum: number;
  readonly powderDirectMaximum: number;
  readonly extinctionEdgeStart: number;
  readonly extinctionEdgeEnd: number;
  /** Beer-Lambert extinction coefficient per engine world unit for every ray direction. */
  readonly extinctionScale: number;
  /** Exponent applied to density before Beer-Lambert extinction. */
  readonly densitySmoothness: number;
  /** Fraction of extinction re-emitted as scattering by cloud droplets. */
  readonly singleScatteringAlbedo: number;
  /** Additive directional light visible only in the low-density cloud boundary. */
  readonly edgeLightIntensity: number;
  /** Linear RGB edge-light radiance. */
  readonly edgeLightColor: VolumetricCloudLightingColor;
  readonly phaseForwardAnisotropy: number;
  readonly phaseBackwardAnisotropy: number;
  readonly phaseBlend: number;
  readonly multipleScatteringOctaves: number;
  readonly multipleScatteringEnergyAttenuation: number;
  readonly multipleScatteringExtinctionAttenuation: number;
  readonly multipleScatteringAnisotropyAttenuation: number;
  readonly multipleScatteringMaxOpticalDepth: number;
  readonly ambientSkyColorBlend: number;
  readonly ambientGroundColorBlend: number;
  readonly ambientShadowStrength: number;
  readonly stormAmbientMultiplier: number;
  readonly cachePhaseIsotropyBlend: number;
  readonly cacheAmbientWeight: number;
  readonly cacheExposureScale: number;
  readonly cacheExposureMinimum: number;
  readonly cacheExposureMaximum: number;
  readonly cacheEncodingGamma: number;
  readonly skyGradientStart: number;
  readonly skyGradientEnd: number;
  readonly skyGradientExponent: number;
  readonly horizonGlowFalloff: number;
  readonly horizonGlowStrength: number;
  readonly solarHorizonTint: VolumetricCloudLightingColor;
  readonly solarHorizonPower: number;
  readonly solarHorizonStrength: number;
  readonly sunDiscStart: number;
  readonly sunDiscEnd: number;
  readonly sunDiscStrength: number;
  readonly sunHaloPower: number;
  readonly sunHaloStrength: number;
  readonly sunRadianceColor: VolumetricCloudLightingColor;
  readonly sunHorizonFadeStart: number;
  readonly sunHorizonFadeEnd: number;
}

const DEFAULT_EDGE_LIGHT_COLOR: VolumetricCloudLightingColor = Object.freeze([1, 0.82, 0.62]);
const DEFAULT_SOLAR_HORIZON_TINT: VolumetricCloudLightingColor = Object.freeze([1, 0.55, 0.28]);
const DEFAULT_SUN_RADIANCE_COLOR: VolumetricCloudLightingColor = Object.freeze([1.35, 1.08, 0.78]);
const DEFAULT_LIGHT_STEP_PATTERN: VolumetricCloudLightStepPattern = Object.freeze([0.25, 1, 3, 8, 16, 32]);

/** Current quality-scaled sun-ray integration and multiple-scattering baseline expressed as data. */
export const VOLUMETRIC_CLOUD_DEFAULT_LIGHTING_PROFILE: Readonly<VolumetricCloudLightingProfile> = Object.freeze({
  lightMarchDistanceScale: 1.15,
  lightStepPattern: DEFAULT_LIGHT_STEP_PATTERN,
  stormExtinctionMultiplier: 1.45,
  inscatteringDensityScale: 1.6,
  multipleScatteringMinimum: 0.18,
  directionalEnergyScale: 0.7,
  directionalEnergyCompression: 0.24,
  ambientSkyBottom: 0.08,
  ambientSkyTop: 0.3,
  ambientGroundBottom: 0.16,
  ambientGroundTop: 0.035,
  powderDensityScale: 2.2,
  powderDirectMinimum: 0.92,
  powderDirectMaximum: 1.08,
  extinctionEdgeStart: 0,
  extinctionEdgeEnd: 0.045,
  extinctionScale: 0.92,
  densitySmoothness: 1.25,
  singleScatteringAlbedo: 0.995,
  edgeLightIntensity: 0,
  edgeLightColor: DEFAULT_EDGE_LIGHT_COLOR,
  phaseForwardAnisotropy: 0.8,
  phaseBackwardAnisotropy: -0.1,
  phaseBlend: 0.5,
  multipleScatteringOctaves: 8,
  multipleScatteringEnergyAttenuation: 0.45,
  multipleScatteringExtinctionAttenuation: 0.75,
  multipleScatteringAnisotropyAttenuation: 0.5,
  multipleScatteringMaxOpticalDepth: 8,
  ambientSkyColorBlend: 0.65,
  ambientGroundColorBlend: 0.3,
  ambientShadowStrength: 0.035,
  stormAmbientMultiplier: 0.62,
  cachePhaseIsotropyBlend: 0.75,
  cacheAmbientWeight: 0.35,
  cacheExposureScale: 1.35,
  cacheExposureMinimum: 1,
  cacheExposureMaximum: 4,
  cacheEncodingGamma: 2.2,
  skyGradientStart: -0.22,
  skyGradientEnd: 0.9,
  skyGradientExponent: 0.62,
  horizonGlowFalloff: 5.2,
  horizonGlowStrength: 0.13,
  solarHorizonTint: DEFAULT_SOLAR_HORIZON_TINT,
  solarHorizonPower: 5,
  solarHorizonStrength: 0.22,
  sunDiscStart: 0.99986,
  sunDiscEnd: 0.99994,
  sunDiscStrength: 2.65,
  sunHaloPower: 96,
  sunHaloStrength: 0.16,
  sunRadianceColor: DEFAULT_SUN_RADIANCE_COLOR,
  sunHorizonFadeStart: -0.04,
  sunHorizonFadeEnd: 0.02
});

/** Validate and detach a lighting profile before it becomes material state. */
export function createVolumetricCloudLightingProfile(
  profile: Readonly<VolumetricCloudLightingProfile> = VOLUMETRIC_CLOUD_DEFAULT_LIGHTING_PROFILE
): Readonly<VolumetricCloudLightingProfile> {
  const { edgeLightColor, solarHorizonTint, sunRadianceColor, lightStepPattern, ...scalarProfile } = profile;
  for (const [name, value] of Object.entries(scalarProfile)) {
    if (!Number.isFinite(value)) {
      throw new RangeError(`Volumetric cloud lighting ${name} must be finite`);
    }
  }
  validateColor("edge-light", edgeLightColor);
  validateColor("solar-horizon tint", solarHorizonTint);
  validateColor("sun radiance", sunRadianceColor);
  if (
    !Array.isArray(lightStepPattern) ||
    lightStepPattern.length !== DEFAULT_LIGHT_STEP_PATTERN.length ||
    lightStepPattern.some((distance) => !Number.isFinite(distance) || distance <= 0)
  ) {
    throw new RangeError("Volumetric cloud light-step pattern must contain six finite positive distances");
  }
  if (
    profile.lightMarchDistanceScale <= 0 ||
    profile.stormExtinctionMultiplier < 0 ||
    profile.inscatteringDensityScale < 0 ||
    profile.multipleScatteringMinimum < 0 ||
    profile.multipleScatteringMinimum > 1 ||
    profile.directionalEnergyScale < 0 ||
    profile.directionalEnergyCompression < 0 ||
    profile.ambientSkyBottom < 0 ||
    profile.ambientSkyTop < 0 ||
    profile.ambientGroundBottom < 0 ||
    profile.ambientGroundTop < 0 ||
    profile.powderDensityScale < 0 ||
    profile.powderDirectMinimum < 0 ||
    profile.powderDirectMaximum < 0 ||
    profile.powderDirectMinimum > profile.powderDirectMaximum ||
    profile.extinctionEdgeStart >= profile.extinctionEdgeEnd ||
    profile.extinctionScale <= 0 ||
    profile.densitySmoothness <= 0 ||
    profile.singleScatteringAlbedo < 0 ||
    profile.singleScatteringAlbedo > 1 ||
    profile.edgeLightIntensity < 0 ||
    Math.abs(profile.phaseForwardAnisotropy) >= 1 ||
    Math.abs(profile.phaseBackwardAnisotropy) >= 1 ||
    profile.phaseBlend < 0 ||
    profile.phaseBlend > 1 ||
    !Number.isSafeInteger(profile.multipleScatteringOctaves) ||
    profile.multipleScatteringOctaves <= 0 ||
    profile.multipleScatteringEnergyAttenuation <= 0 ||
    profile.multipleScatteringEnergyAttenuation > 1 ||
    profile.multipleScatteringExtinctionAttenuation <= 0 ||
    profile.multipleScatteringExtinctionAttenuation > 1 ||
    profile.multipleScatteringAnisotropyAttenuation <= 0 ||
    profile.multipleScatteringAnisotropyAttenuation > 1 ||
    profile.multipleScatteringMaxOpticalDepth <= 0 ||
    profile.ambientSkyColorBlend < 0 ||
    profile.ambientSkyColorBlend > 1 ||
    profile.ambientGroundColorBlend < 0 ||
    profile.ambientGroundColorBlend > 1 ||
    profile.ambientShadowStrength < 0 ||
    profile.stormAmbientMultiplier < 0 ||
    profile.cachePhaseIsotropyBlend < 0 ||
    profile.cachePhaseIsotropyBlend > 1 ||
    profile.cacheAmbientWeight < 0 ||
    profile.cacheExposureScale <= 0 ||
    profile.cacheExposureMinimum <= 0 ||
    profile.cacheExposureMinimum > profile.cacheExposureMaximum ||
    profile.cacheEncodingGamma <= 0 ||
    profile.skyGradientStart >= profile.skyGradientEnd ||
    profile.skyGradientExponent <= 0 ||
    profile.horizonGlowFalloff <= 0 ||
    profile.horizonGlowStrength < 0 ||
    profile.solarHorizonPower <= 0 ||
    profile.solarHorizonStrength < 0 ||
    profile.sunDiscStart >= profile.sunDiscEnd ||
    profile.sunDiscStrength < 0 ||
    profile.sunHaloPower <= 0 ||
    profile.sunHaloStrength < 0 ||
    profile.sunHorizonFadeStart >= profile.sunHorizonFadeEnd
  ) {
    throw new RangeError("Volumetric cloud lighting profile contains an invalid ordered range");
  }
  const detachedEdgeLightColor: [number, number, number] = [edgeLightColor[0], edgeLightColor[1], edgeLightColor[2]];
  const detachedSolarHorizonTint: [number, number, number] = [
    solarHorizonTint[0],
    solarHorizonTint[1],
    solarHorizonTint[2]
  ];
  const detachedSunRadianceColor: [number, number, number] = [
    sunRadianceColor[0],
    sunRadianceColor[1],
    sunRadianceColor[2]
  ];
  const detachedLightStepPattern: [number, number, number, number, number, number] = [
    lightStepPattern[0],
    lightStepPattern[1],
    lightStepPattern[2],
    lightStepPattern[3],
    lightStepPattern[4],
    lightStepPattern[5]
  ];
  Object.freeze(detachedEdgeLightColor);
  Object.freeze(detachedSolarHorizonTint);
  Object.freeze(detachedSunRadianceColor);
  Object.freeze(detachedLightStepPattern);
  return Object.freeze({
    ...profile,
    edgeLightColor: detachedEdgeLightColor,
    solarHorizonTint: detachedSolarHorizonTint,
    sunRadianceColor: detachedSunRadianceColor,
    lightStepPattern: detachedLightStepPattern
  });
}

function validateColor(name: string, color: VolumetricCloudLightingColor): void {
  if (
    !Array.isArray(color) ||
    color.length !== 3 ||
    color.some((channel) => !Number.isFinite(channel) || channel < 0)
  ) {
    throw new RangeError(`Volumetric cloud ${name} color must contain three finite, non-negative linear channels`);
  }
}
