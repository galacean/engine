import { SEED_WORLD_WATER_SHADER_AOT_PROFILE_DEFINITIONS } from "./SeedWorldWaterShaderAotProfiles";

export interface RegisterSeedWorldWaterStartupShadersOptions {
  /** Whether to register ocean AOT profiles (`ocean-near-detailed`, `ocean-far-graded`). Defaults to true. */
  readonly includeOcean?: boolean;
}

/** Registers finite production Water Shaders before the World runtime or any Water body exists. */
export function registerSeedWorldWaterStartupShaders(
  options: RegisterSeedWorldWaterStartupShadersOptions = {}
): readonly string[] {
  const includeOcean = options.includeOcean !== false;
  const profiles = includeOcean
    ? SEED_WORLD_WATER_SHADER_AOT_PROFILE_DEFINITIONS
    : SEED_WORLD_WATER_SHADER_AOT_PROFILE_DEFINITIONS.filter((profile) => !profile.id.startsWith("ocean-"));
  return Object.freeze(
    profiles.map((profile) => {
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
