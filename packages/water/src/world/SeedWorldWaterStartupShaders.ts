import { SEED_WORLD_WATER_SHADER_AOT_PROFILE_DEFINITIONS } from "./SeedWorldWaterShaderAotProfiles";

/** Registers every finite production Water Shader before the World runtime or any Water body exists. */
export function registerSeedWorldWaterStartupShaders(): readonly string[] {
  return Object.freeze(
    SEED_WORLD_WATER_SHADER_AOT_PROFILE_DEFINITIONS.map((profile) => {
      const shader = profile.resolveShader();
      if (shader.name !== profile.shaderName) {
        throw new Error(
          `Seed World Water startup profile '${profile.id}' expected Shader '${profile.shaderName}', got '${shader.name}'.`
        );
      }
      return shader.name;
    })
  );
}
