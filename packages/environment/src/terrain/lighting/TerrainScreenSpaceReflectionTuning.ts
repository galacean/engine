import { ScreenSpaceReflectionQuality, type ScreenSpaceReflectionSettingsData } from "@galacean/engine";

/**
 * Shared scene-space reach for terrain rain water film and transparent Water SSR.
 * Allows calm puddles, lakes, and river channels to capture distant terrain, trees, and clouds.
 */
export const TERRAIN_SCREEN_SPACE_REFLECTION_MAX_RAY_DISTANCE_METRES = 168;

/** Shared near-field depth thickness floor for world-scale water and terrain water-film traces. */
export const TERRAIN_SCREEN_SPACE_REFLECTION_MIN_THICKNESS_METRES = 0.2;

/** Narrower viewport edge fade for horizontal water receivers so distant horizon hits stay visible. */
export const TERRAIN_WATER_SCREEN_SPACE_REFLECTION_EDGE_FADE = 0.02;

/** Default quality preset for Seed World (0.5x chain, 28 Hi-Z steps, surface temporal accumulation with aliased recvNR). */
export const TERRAIN_SCREEN_SPACE_REFLECTION_QUALITY = ScreenSpaceReflectionQuality.Medium;

/** Default roughness cutoff covering standing terrain water film and calm lake water. */
export const TERRAIN_SCREEN_SPACE_REFLECTION_MAX_ROUGHNESS = 0.65;

/** Default temporal history blend weight used by Medium and High quality presets. */
export const TERRAIN_SCREEN_SPACE_REFLECTION_TEMPORAL_BLEND = 0.85;

/** Default to 0-Hi-Z mip-0 linear ray marching on Medium quality while keeping Hi-Z available via settings. */
export const TERRAIN_SCREEN_SPACE_REFLECTION_USE_LINEAR_TRACE = true;

/** Shared v2 SSR settings preset for Seed World terrain rain film and transparent Water surfaces. */
export const TERRAIN_SCREEN_SPACE_REFLECTION_SETTINGS: Readonly<ScreenSpaceReflectionSettingsData> = {
  enabled: true,
  quality: TERRAIN_SCREEN_SPACE_REFLECTION_QUALITY,
  intensity: 1,
  maxRoughness: TERRAIN_SCREEN_SPACE_REFLECTION_MAX_ROUGHNESS,
  maxDistance: TERRAIN_SCREEN_SPACE_REFLECTION_MAX_RAY_DISTANCE_METRES,
  thickness: TERRAIN_SCREEN_SPACE_REFLECTION_MIN_THICKNESS_METRES,
  edgeFade: TERRAIN_WATER_SCREEN_SPACE_REFLECTION_EDGE_FADE,
  temporalBlend: TERRAIN_SCREEN_SPACE_REFLECTION_TEMPORAL_BLEND,
  useLinearTrace: TERRAIN_SCREEN_SPACE_REFLECTION_USE_LINEAR_TRACE
};
