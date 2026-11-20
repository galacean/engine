/**
 * Shared scene-space reach for terrain water film and transparent Water SSR.
 * High-tier transparent Water distributes up to 64 samples along the projected ray
 * and performs five binary refinements against full-resolution depth; Terrain rain
 * film defaults to quarter-resolution tracing (24 samples, two refinements).
 */
export const TERRAIN_SCREEN_SPACE_REFLECTION_MAX_RAY_DISTANCE_METRES = 168;

/** Preserve the former final-ten-percent fade while exposing it as a world-space tuning value. */
export const TERRAIN_SCREEN_SPACE_REFLECTION_RAY_LENGTH_FADE_METRES =
  TERRAIN_SCREEN_SPACE_REFLECTION_MAX_RAY_DISTANCE_METRES * 0.1;

/** Shared near-field floor before the trace expands thickness with linear depth. */
export const TERRAIN_SCREEN_SPACE_REFLECTION_MIN_THICKNESS_METRES = 0.2;

/** Quarter linear resolution used by Terrain rain-film SSR to reduce trace pixel cost. */
export const TERRAIN_RAIN_SCREEN_SPACE_REFLECTION_RESOLUTION_SCALE = 0.25;

/** Quarter linear resolution used by mobile transparent Water SSR to preserve reflection silhouettes at lower bandwidth. */
export const TERRAIN_MOBILE_WATER_SCREEN_SPACE_REFLECTION_RESOLUTION_SCALE = 0.25;

/** Half linear resolution traces one quarter as many pixels for transparent Water SSR while preserving full-resolution depth. */
export const TERRAIN_SCREEN_SPACE_REFLECTION_RESOLUTION_SCALE = 0.5;

/** Narrower viewport edge fade for horizontal water receivers so distant horizon hits stay visible. */
export const TERRAIN_WATER_SCREEN_SPACE_REFLECTION_EDGE_FADE = 0.02;
