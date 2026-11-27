import type { VolumetricCloudScaleSettings } from "@galacean/engine-core";

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
