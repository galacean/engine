/**
 * Hangzhou at the March equinox.
 *
 * The north offset maps geographic north onto the showcase world's axes without changing the celestial trajectory.
 */
export const PROCEDURAL_SKY_SOLAR_POSITION = {
  year: 2027,
  latitude: 30.2741,
  longitude: 120.1551,
  utcOffset: 8,
  dayOfYear: 80,
  daysInYear: 365,
  northOffset: 165.5,
  atmosphericRefraction: true
} as const;

/**
 * Start of astronomical dawn for the shared solar profile, rounded to the authoring timeline.
 * Deep-night lighting stays on its midnight plateau before this boundary.
 */
export const PROCEDURAL_SKY_ASTRONOMICAL_DAWN_START_HOURS = 4.7;

/**
 * Mobile-first progressive bake quality shared by every Procedural Sky consumer.
 *
 * A 128px face keeps the retained HDR cubemaps and offscreen tile traffic bounded while the
 * 64-sample GGX integration preserves the released roughness response. The capture shader's
 * pixel-footprint star filter integrates sub-texel stars without requiring a 512px face.
 */
export const PROCEDURAL_SKY_REALTIME_IBL_OPTIONS = {
  resolution: 128,
  sampleCount: 64
} as const;

/** Minimum wall-clock request interval for continuously animated sky content. */
export const PROCEDURAL_SKY_REALTIME_IBL_DYNAMIC_REFRESH_INTERVAL_SECONDS = 1;
