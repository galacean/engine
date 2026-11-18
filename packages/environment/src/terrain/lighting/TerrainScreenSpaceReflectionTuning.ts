/**
 * Shared scene-space reach for terrain water film and transparent Water SSR.
 * High quality distributes up to 64 samples along the projected ray and performs
 * five binary refinements against full-resolution depth.
 */
export const TERRAIN_SCREEN_SPACE_REFLECTION_MAX_RAY_DISTANCE_METRES = 168;

/** Preserve the former final-ten-percent fade while exposing it as a world-space tuning value. */
export const TERRAIN_SCREEN_SPACE_REFLECTION_RAY_LENGTH_FADE_METRES =
  TERRAIN_SCREEN_SPACE_REFLECTION_MAX_RAY_DISTANCE_METRES * 0.1;

/** Shared near-field floor before the trace expands thickness with linear depth. */
export const TERRAIN_SCREEN_SPACE_REFLECTION_MIN_THICKNESS_METRES = 0.01;

/** Half linear resolution traces one quarter as many pixels while preserving full-resolution depth. */
export const TERRAIN_SCREEN_SPACE_REFLECTION_RESOLUTION_SCALE = 0.5;
