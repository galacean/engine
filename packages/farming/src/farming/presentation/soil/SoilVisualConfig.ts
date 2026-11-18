/** Default farming soil appearance. Resource references stay within the farming subsystem. */
export const DEFAULT_SOIL_VISUAL_CONFIG = Object.freeze({
  soil: Object.freeze({
    textures: Object.freeze({
      diffuse: new URL("../../assets/soil/juliovii/basecolor.jpg", import.meta.url).href,
      normal: new URL("../../assets/soil/juliovii/normalogl.jpg", import.meta.url).href
    }),
    moisture: Object.freeze({
      dry: Object.freeze({ color: Object.freeze([0.64, 0.47, 0.32, 1] as const), roughness: 1 }),
      saturated: Object.freeze({ color: Object.freeze([0.26, 0.16, 0.095, 1] as const), roughness: 0.68 }),
      /** Exponential response time in seconds; about 95% settled after three times this value. */
      transitionSeconds: 0.45
    }),
    normalIntensity: 0.16,
    edge: Object.freeze({
      /** Inward blend width in metres; kept below half a cell so plot centres stay opaque. */
      blendWidth: 0.22,
      /** Round exposed convex corners inward; never paint outside the logical cell. */
      cornerRadiusFraction: 0.16,
      /** Relative width variation (0..1), sampled in world space to avoid tile seams. */
      irregularity: 0.3,
      /** World-space variation frequency in radians/metre; larger values make smaller details. */
      noiseFrequency: 18,
      /** Minimum separation from the host terrain in metres, to prevent z-fighting. */
      surfaceOffset: 0.002
    })
  }),
  perimeter: Object.freeze({
    textures: Object.freeze({
      diffuse: new URL("../../assets/soil/grasslands/grass-mud-albedo-smoothness-1024.png", import.meta.url).href,
      normal: new URL("../../assets/soil/grasslands/grass-mud-normal-1024.png", import.meta.url).href
    }),
    color: Object.freeze([0.78, 0.84, 0.68, 1] as const),
    roughness: 0.94,
    tilingOffset: Object.freeze([8, 8, 0.08, 0.03] as const),
    normalIntensity: 0.32
  }),
  anisoLevel: 4
});
