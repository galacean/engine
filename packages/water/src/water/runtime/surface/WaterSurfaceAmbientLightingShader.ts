import waterSurfaceAmbientLightingShaderFunctions from "../../shaders/library/surface/WaterSurfaceAmbientLighting.glsl?raw";
import waterSurfaceAmbientLightingUniformDeclarations from "../../shaders/library/surface/WaterSurfaceAmbientLightingUniforms.glsl?raw";

/** Shared scene-ambient declarations and irradiance evaluation for Water Surface V2 backends. */
export const WATER_SURFACE_AMBIENT_LIGHTING_UNIFORM_DECLARATIONS = waterSurfaceAmbientLightingUniformDeclarations;

export const WATER_SURFACE_AMBIENT_LIGHTING_SHADER_FUNCTIONS = waterSurfaceAmbientLightingShaderFunctions;
