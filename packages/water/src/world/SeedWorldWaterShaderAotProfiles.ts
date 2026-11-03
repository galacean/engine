import { WaterSurfaceDepthSource, WaterQualityTier } from "../water/index";

import { LAKE_COMPILED_SURFACE_APPEARANCE_V2 } from "../water/presets/lake/index";
import {
  createHeightfieldWaterSurfaceAppearanceV2ShaderModule,
  resolveHeightfieldWaterSurfaceAppearanceV2Shader
} from "../water/runtime/heightfield/index";
import type { WaterShaderModule } from "../water/runtime/index";
import {
  createOceanFarShaderModule,
  resolveOceanFarShader,
  createOceanShaderModule,
  resolveOceanShader
} from "../water/runtime/ocean/index";

import type { Shader } from "@galacean/engine-core";
import {
  SEED_WORLD_WATER_SHADER_AOT_CONTRACT,
  type SeedWorldWaterShaderAotProfileId
} from "./SeedWorldWaterShaderAotContract";

/** One finite production responsibility compiled ahead of time for Seed World. */
export interface SeedWorldWaterShaderAotProfile {
  readonly id: string;
  readonly sourceFileName: string;
  readonly shaderName: string;
  readonly module: WaterShaderModule;
}

export interface SeedWorldWaterShaderAotProfileDefinition {
  readonly id: string;
  readonly sourceFileName: string;
  readonly shaderName: string;
  readonly createModule: () => WaterShaderModule;
  readonly resolveShader: () => Shader;
}

const SEED_WORLD_LAKE_QUALITY = WaterQualityTier.High;
const SEED_WORLD_LAKE_DEPTH_SOURCE = WaterSurfaceDepthSource.HybridOptionalSceneDepth;

type SeedWorldWaterShaderFactory = Pick<SeedWorldWaterShaderAotProfileDefinition, "createModule" | "resolveShader">;

const SEED_WORLD_WATER_SHADER_FACTORIES = Object.freeze({
  "lake-heightfield-high-hybrid-v2": Object.freeze({
    createModule: () =>
      createHeightfieldWaterSurfaceAppearanceV2ShaderModule(
        SEED_WORLD_LAKE_QUALITY,
        LAKE_COMPILED_SURFACE_APPEARANCE_V2,
        0,
        SEED_WORLD_LAKE_DEPTH_SOURCE
      ),
    resolveShader: () =>
      resolveHeightfieldWaterSurfaceAppearanceV2Shader(
        SEED_WORLD_LAKE_QUALITY,
        LAKE_COMPILED_SURFACE_APPEARANCE_V2,
        0,
        SEED_WORLD_LAKE_DEPTH_SOURCE
      )
  }),
  "ocean-near-detailed": Object.freeze({
    createModule: createOceanShaderModule,
    resolveShader: resolveOceanShader
  }),
  "ocean-far-graded": Object.freeze({
    createModule: createOceanFarShaderModule,
    resolveShader: resolveOceanFarShader
  })
} satisfies Record<SeedWorldWaterShaderAotProfileId, SeedWorldWaterShaderFactory>);

/**
 * Seed World's finite Water presentation boundary.
 *
 * Terrain can AOT every authored Shader because its capability set is finite. Water additionally
 * accepts unbounded PCG appearance combinations, so only these exact Lake/Ocean responsibilities
 * are AOT-owned; every other structural identity remains on WaterShaderModule's cache-first JIT
 * path. The factories below are the same factories used by that fallback, preventing source drift.
 */
export const SEED_WORLD_WATER_SHADER_AOT_PROFILE_DEFINITIONS: readonly SeedWorldWaterShaderAotProfileDefinition[] =
  Object.freeze(
    SEED_WORLD_WATER_SHADER_AOT_CONTRACT.map((contract) =>
      Object.freeze({ ...contract, ...SEED_WORLD_WATER_SHADER_FACTORIES[contract.id] })
    )
  );

/** Rebuilds all production profiles from their authoritative Water module factories. */
export function createSeedWorldWaterShaderAotProfiles(): readonly SeedWorldWaterShaderAotProfile[] {
  const profiles = SEED_WORLD_WATER_SHADER_AOT_PROFILE_DEFINITIONS.map((definition) =>
    Object.freeze({
      id: definition.id,
      sourceFileName: definition.sourceFileName,
      shaderName: definition.shaderName,
      module: definition.createModule()
    })
  );
  const ids = new Set(profiles.map((profile) => profile.id));
  const names = new Set(profiles.map((profile) => profile.shaderName));
  if (ids.size !== profiles.length || names.size !== profiles.length) {
    throw new Error("Seed World Water AOT profiles require unique ids and Shader names.");
  }
  for (const profile of profiles) {
    if (profile.module.name !== profile.shaderName) {
      throw new Error(
        `Seed World Water AOT profile '${profile.id}' expected Shader '${profile.shaderName}', got '${profile.module.name}'.`
      );
    }
  }
  return Object.freeze(profiles);
}
