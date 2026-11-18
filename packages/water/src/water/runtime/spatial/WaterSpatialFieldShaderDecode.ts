import waterSpatialFieldShaderDecodeFunctions from "../../shaders/library/spatial/WaterSpatialFieldDecode.glsl?raw";

/**
 * Shared GLSL decode functions for Water-owned RGBA8 Spatial Field atlases.
 *
 * Runtime materials and the transient GPU calibration fixture assemble this
 * exact source so that readback validates the same decode implementation used
 * by rendering.
 */
export function createWaterSpatialFieldShaderDecodeFunctions(): string {
  return waterSpatialFieldShaderDecodeFunctions;
}
