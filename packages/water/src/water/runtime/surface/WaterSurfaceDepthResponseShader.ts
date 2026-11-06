import waterSurfaceDepthResponseShaderFunctions from "../../shaders/library/surface/WaterSurfaceDepthResponse.glsl?raw";

/** Shared GLSL Water depth reconstruction and density functions. See `third_party/water-depth-provenance`. */
export function createWaterSurfaceDepthResponseShaderFunctions(): string {
  return waterSurfaceDepthResponseShaderFunctions;
}
