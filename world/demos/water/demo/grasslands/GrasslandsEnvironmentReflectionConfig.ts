/** Source-authored scene environment metadata kept free of runtime engine objects. */
export const GRASSLANDS_ENVIRONMENT_REFLECTION_ROTATION_DEGREES = 64;
export const GRASSLANDS_ENVIRONMENT_REFLECTION_EXPOSURE = 0.44999998807907104;
export const GRASSLANDS_ENVIRONMENT_REFLECTION_HDR = true;

/**
 * Source scene: the local reflection capture under the lighting root.
 *
 * The audited source-to-Galacean position conversion is
 * `(x + 1500, y, 1500 - z)`. Box Z is therefore mirrored around the converted
 * centre while its axis-aligned size remains unchanged.
 */
export const GRASSLANDS_LOCAL_REFLECTION_PROBE = Object.freeze({
  resolution: 128,
  nearClip: 0.3,
  farClip: 1000,
  hdr: true,
  projection: Object.freeze({
    mode: "box" as const,
    probePosition: Object.freeze([1286.03655, 101.80171, 1660.502243] as const),
    boxMinimum: Object.freeze([1058.13518, -23.93903, 989.105077] as const),
    boxMaximum: Object.freeze([2093.10418, 341.37219, 2076.232477] as const)
  })
});
