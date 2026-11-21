import {
  VOLUMETRIC_CLOUD_DEFAULT_LIGHTING_PROFILE,
  VOLUMETRIC_CLOUD_DEFAULT_SHAPE_SETTINGS,
  type VolumetricCloudLightingProfile,
  type VolumetricCloudShapeSettings
} from "@galacean/engine-core";
export {
  TERRAIN_CLEAR_VOLUMETRIC_CLOUD_AUTHORING_SCALE_SETTINGS,
  TERRAIN_CLEAR_VOLUMETRIC_CLOUD_SCALE_SETTINGS,
  describeTerrainVolumetricCloudScaleSettings,
  resolveTerrainVolumetricCloudScaleSettings,
  type TerrainVolumetricCloudAuthoringScaleSettings
} from "./TerrainVolumetricCloudScalePreset";

/** Artist-approved clear-sky morphology captured from the Terrain authoring controls. */
export const TERRAIN_CLEAR_VOLUMETRIC_CLOUD_SHAPE_PROFILE: Readonly<VolumetricCloudShapeSettings> = Object.freeze({
  ...VOLUMETRIC_CLOUD_DEFAULT_SHAPE_SETTINGS,
  bottomShape: 0.6,
  middleShape: -5.64,
  topShape: -7.6,
  rampShape: 0.49,
  cloudTypeShaping: 0.225,
  baseErosionIntensity: 0.195,
  baseNoiseMultiplier: 1.56,
  detailErosionScale: 0.78,
  maxDetailErosion: 0.465,
  detailNoiseMultiplier: 0.86,
  curlIntensity: 0.59,
  topDensityMultiplier: 0.13,
  topSkewRatio: 0.165,
  profileTypeOffset: -0.585,
  envelopeScale: 0.38,
  bottomFadeExponent: 5.15,
  bottomFadeStrength: 0.74,
  topFadeExponent: 5.15,
  topFadeStrength: 0.82,
  topCutoff: 0.55,
  detailAnimationSpeed: 0.0075,
  detailCurlFrequency: 2.23,
  detailCurlBlend: 0.63,
  detailCurlExponent: 0.225,
  detailVerticalCurlStrength: 0.46,
  detailHeightErosionScale: 9
});

/**
 * Weather-owned optical kernel captured from the Terrain authoring controls.
 *
 * Celestial time must not mutate extinction, phase, density or layer geometry. The shared
 * cloud runtime applies Sun/Moon radiance from DayNightState on top of this stable kernel.
 */
export const TERRAIN_CLEAR_VOLUMETRIC_CLOUD_LIGHTING_PROFILE: Readonly<VolumetricCloudLightingProfile> = Object.freeze({
  ...VOLUMETRIC_CLOUD_DEFAULT_LIGHTING_PROFILE,
  lightMarchDistanceScale: 0.67,
  stormExtinctionMultiplier: 0.43,
  inscatteringDensityScale: 1.4,
  multipleScatteringMinimum: 0.16,
  directionalEnergyScale: 1.62,
  directionalEnergyCompression: 0.06,
  ambientSkyBottom: 0.31,
  ambientSkyTop: 0.363,
  ambientGroundBottom: 0.365,
  ambientGroundTop: 0.23,
  powderDensityScale: 2.15,
  powderDirectMinimum: 0.73,
  powderDirectMaximum: 0.79,
  extinctionEdgeStart: 0.085,
  extinctionEdgeEnd: 0.127,
  extinctionScale: 0.00952,
  densitySmoothness: 0.94,
  singleScatteringAlbedo: 0.861,
  edgeLightIntensity: 1.23,
  phaseForwardAnisotropy: -0.21,
  phaseBackwardAnisotropy: -0.449,
  phaseBlend: 0.275,
  multipleScatteringOctaves: 8,
  multipleScatteringEnergyAttenuation: 0.376,
  multipleScatteringExtinctionAttenuation: 0.308,
  multipleScatteringAnisotropyAttenuation: 0.488,
  multipleScatteringMaxOpticalDepth: 8.4,
  ambientSkyColorBlend: 0.75,
  ambientGroundColorBlend: 0.319,
  ambientShadowStrength: 0.345,
  stormAmbientMultiplier: 0.58
});
