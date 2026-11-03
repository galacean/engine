import { Shader, ShaderFactory } from "@galacean/engine";
import grassColorFieldSource from "../shaders/shared/GrassColorField.glsl?raw";
import grassGroundAppearanceSource from "../shaders/shared/GrassGroundAppearance.glsl?raw";
import terrainLightingSource from "../shaders/shared/Lighting.glsl?raw";
import proceduralLodDitherSource from "../shaders/shared/ProceduralLodDither.glsl?raw";
import sceneSeasonSource from "../shaders/shared/SceneSeason.glsl?raw";
import surfaceClimateSource from "../shaders/shared/SurfaceClimate.glsl?raw";
import terrainShadowSource from "../shaders/shared/Shadow.glsl?raw";
import surfaceGrassCoverageSource from "../shaders/shared/SurfaceGrassCoverage.glsl?raw";
import terrainSurfaceDataSource from "../shaders/shared/TerrainSurfaceData.glsl?raw";
import toonDiffuseLightingSource from "../shaders/shared/ToonDiffuseLighting.glsl?raw";
import toonRockShaderSource from "./SeedWorldRockToon.shader?raw";

export const SEED_WORLD_ROCK_TOON_SHADER_NAME = "Terrain/SeedWorldRockToon";

const SEED_WORLD_ROCK_TOON_SHADOW_INCLUDE = "SeedWorldRockToon/Shadow.glsl";
let configuredRockDebugView = 0;

/** Captures the query-only black/white diagnostic before the first rock material is created. */
export function configureSeedWorldRockDebugView(value: string | null): void {
  configuredRockDebugView =
    value === "top" ? 1 : value === "coverage" ? 2 : value === "transition" ? 3 : value === "white" ? 4 : 0;
}

/** @returns Numeric Shader diagnostic selected during page startup. */
export function getSeedWorldRockDebugView(): number {
  return configuredRockDebugView;
}

/** Registers the finite RockToon Shader before strict Seed World variant warmup. */
export function registerSeedWorldRockToonShader(): Shader {
  const includes = {
    [SEED_WORLD_ROCK_TOON_SHADOW_INCLUDE]: terrainShadowSource,
    "shared/Shadow.glsl": terrainShadowSource,
    "shared/ToonDiffuseLighting.glsl": toonDiffuseLightingSource,
    "shared/SurfaceGrassCoverage.glsl": surfaceGrassCoverageSource,
    "shared/ProceduralLodDither.glsl": proceduralLodDitherSource,
    "shared/Lighting.glsl": terrainLightingSource,
    "shared/GrassGroundAppearance.glsl": grassGroundAppearanceSource,
    "shared/SceneSeason.glsl": sceneSeasonSource,
    "shared/SurfaceClimate.glsl": surfaceClimateSource,
    "shared/TerrainSurfaceData.glsl": terrainSurfaceDataSource,
    "shared/GrassColorField.glsl": grassColorFieldSource
  } as const;
  for (const [name, source] of Object.entries(includes)) {
    if (!ShaderFactory.includeMap[name]) ShaderFactory.registerInclude(name, source);
  }
  return Shader.find(SEED_WORLD_ROCK_TOON_SHADER_NAME) ?? Shader.create(toonRockShaderSource);
}
