import waterEnvironmentReflectionShaderFunctions from "../../shaders/library/optics/WaterEnvironmentReflection.glsl?raw";
import waterEnvironmentReflectionUniformDeclarations from "../../shaders/library/optics/WaterEnvironmentReflectionUniforms.glsl?raw";

/** Shared GLSL for scene-owned cubemap orientation, color space, exposure, and roughness. */
export const WATER_ENVIRONMENT_REFLECTION_UNIFORM_DECLARATIONS = waterEnvironmentReflectionUniformDeclarations;

export const WATER_ENVIRONMENT_REFLECTION_SHADER_FUNCTIONS = waterEnvironmentReflectionShaderFunctions;
