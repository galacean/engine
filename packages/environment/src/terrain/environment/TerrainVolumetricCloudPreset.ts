import {
  VOLUMETRIC_CLOUD_DEFAULT_LIGHTING_PROFILE,
  VOLUMETRIC_CLOUD_DEFAULT_SHAPE_SETTINGS,
  type VolumetricCloudLightingProfile,
  type VolumetricCloudScaleSettings,
  type VolumetricCloudShapeSettings
} from "@galacean/engine-core";

export interface TerrainVolumetricCloudAuthoringScaleSettings {
  planetRadius: number;
  baseAltitude: number;
  thickness: number;
  weatherSize: number;
  shapeSize: number;
  detailSize: number;
  shapeVerticalFrequency: number;
  detailVerticalFrequency: number;
}

/**
 * Engine cloud fields consume spatial frequency in inverse world units, while artists author the reciprocal visual size.
 * These reference frequencies define that single semantic boundary; no camera- or terrain-derived unit conversion is used.
 */
const TERRAIN_VOLUMETRIC_CLOUD_REFERENCE_SPATIAL_FREQUENCIES = Object.freeze({
  weatherScale: 0.00005,
  shapeScale: 0.000275,
  detailScale: 0.0001375
});

/** Artist-approved daytime layer and feature sizes captured from the Terrain authoring controls. */
export const TERRAIN_CLEAR_VOLUMETRIC_CLOUD_AUTHORING_SCALE_SETTINGS: Readonly<TerrainVolumetricCloudAuthoringScaleSettings> =
  Object.freeze({
    planetRadius: 5_185,
    baseAltitude: 913,
    thickness: 320,
    weatherSize: 1.57,
    shapeSize: 1.19,
    detailSize: 0.95,
    shapeVerticalFrequency: 0.17,
    detailVerticalFrequency: 1.07
  });

/** Resolves artist-facing feature sizes to the engine's inverse-world spatial frequencies. */
export function resolveTerrainVolumetricCloudScaleSettings(
  authoring: Readonly<TerrainVolumetricCloudAuthoringScaleSettings>
): VolumetricCloudScaleSettings {
  return {
    planetRadius: authoring.planetRadius,
    baseAltitude: authoring.baseAltitude,
    thickness: authoring.thickness,
    weatherScale: TERRAIN_VOLUMETRIC_CLOUD_REFERENCE_SPATIAL_FREQUENCIES.weatherScale / authoring.weatherSize,
    shapeScale: TERRAIN_VOLUMETRIC_CLOUD_REFERENCE_SPATIAL_FREQUENCIES.shapeScale / authoring.shapeSize,
    detailScale: TERRAIN_VOLUMETRIC_CLOUD_REFERENCE_SPATIAL_FREQUENCIES.detailScale / authoring.detailSize,
    shapeVerticalFrequency: authoring.shapeVerticalFrequency,
    detailVerticalFrequency: authoring.detailVerticalFrequency
  };
}

/** Recovers the stable artist-facing size coordinates from an active engine scale profile. */
export function describeTerrainVolumetricCloudScaleSettings(
  settings: Readonly<VolumetricCloudScaleSettings>
): TerrainVolumetricCloudAuthoringScaleSettings {
  return {
    planetRadius: settings.planetRadius,
    baseAltitude: settings.baseAltitude,
    thickness: settings.thickness,
    weatherSize: TERRAIN_VOLUMETRIC_CLOUD_REFERENCE_SPATIAL_FREQUENCIES.weatherScale / settings.weatherScale,
    shapeSize: TERRAIN_VOLUMETRIC_CLOUD_REFERENCE_SPATIAL_FREQUENCIES.shapeScale / settings.shapeScale,
    detailSize: TERRAIN_VOLUMETRIC_CLOUD_REFERENCE_SPATIAL_FREQUENCIES.detailScale / settings.detailScale,
    shapeVerticalFrequency: settings.shapeVerticalFrequency,
    detailVerticalFrequency: settings.detailVerticalFrequency
  };
}

/** Artist-approved clear-sky world-space scale resolved once at the demo authoring boundary. */
export const TERRAIN_CLEAR_VOLUMETRIC_CLOUD_SCALE_SETTINGS: Readonly<VolumetricCloudScaleSettings> = Object.freeze(
  resolveTerrainVolumetricCloudScaleSettings(TERRAIN_CLEAR_VOLUMETRIC_CLOUD_AUTHORING_SCALE_SETTINGS)
);

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
