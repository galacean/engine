/**
 * The source pipeline evaluates authored sRGB colors in linear space before the
 * shader sees them. Water uniforms are
 * already linear, so binding the serialized values directly would apply a
 * second, much brighter interpretation.
 */
export const LAKE_WATER_COLOR_LINEAR = Object.freeze([0, 0.16451614, 0.34, 1] as const);
