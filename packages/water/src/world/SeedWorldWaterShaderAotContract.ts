/** Stable, source-free identity for one finite Seed World Water production responsibility. */
export interface SeedWorldWaterShaderAotContractEntry {
  readonly id: "lake-heightfield-high-hybrid-v2" | "ocean-near-detailed" | "ocean-far-graded";
  readonly sourceFileName: string;
  readonly shaderName: string;
}

/**
 * The one structural list shared by offline generation, startup registration, and runtime E2E.
 *
 * This module deliberately imports no Shader source. Consumers that only need identity must not
 * pull Water's JIT templates into test runners or production acceptance tooling.
 */
export const SEED_WORLD_WATER_SHADER_AOT_CONTRACT: readonly SeedWorldWaterShaderAotContractEntry[] = Object.freeze([
  Object.freeze({
    id: "lake-heightfield-high-hybrid-v2",
    sourceFileName: "LakeHeightfieldHighHybrid.shader",
    shaderName: "AIWorld/HeightfieldWaterSurfaceAppearanceV2ed93d4a81a01602dHybridHigh0"
  }),
  Object.freeze({
    id: "ocean-near-detailed",
    sourceFileName: "OceanNearDetailed.shader",
    shaderName: "AIWorld/Ocean"
  }),
  Object.freeze({
    id: "ocean-far-graded",
    sourceFileName: "OceanFarGraded.shader",
    shaderName: "AIWorld/OceanFar"
  })
]);

export type SeedWorldWaterShaderAotProfileId = SeedWorldWaterShaderAotContractEntry["id"];

export const SEED_WORLD_WATER_SHADER_AOT_NAMES: readonly string[] = Object.freeze(
  SEED_WORLD_WATER_SHADER_AOT_CONTRACT.map(({ shaderName }) => shaderName)
);
