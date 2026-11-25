import { Shader, ShaderFactory } from "@galacean/engine";
import TerrainShaderSource from "./Terrain.shader";
import TerrainEvaluationGlsl from "./TerrainEvaluation.glsl";
import TerrainForwardPassGlsl from "./TerrainForwardPass.glsl";
import TerrainGroundBlendGlsl from "./TerrainGroundBlend.glsl";
import TerrainHeightGlsl from "./TerrainHeight.glsl";
import TerrainHeightFieldGlsl from "./TerrainHeightField.glsl";
import TerrainLayerEvaluationGlsl from "./TerrainLayerEvaluation.glsl";
import TerrainLightingGlsl from "./TerrainLighting.glsl";
import TerrainRegionsGlsl from "./TerrainRegions.glsl";
import TerrainShadowGlsl from "./TerrainShadow.glsl";
import TerrainSurfaceDataGlsl from "./TerrainSurfaceData.glsl";

export const TERRAIN_SHADER_NAME = "Terrain/Terrain";

export const terrainShaderSource = TerrainShaderSource;

export const terrainShaderIncludes: ReadonlyArray<{ readonly path: string; readonly source: string }> = [
  { path: "terrain/TerrainRegions.glsl", source: TerrainRegionsGlsl },
  { path: "terrain/TerrainHeightField.glsl", source: TerrainHeightFieldGlsl },
  { path: "terrain/TerrainHeight.glsl", source: TerrainHeightGlsl },
  { path: "terrain/TerrainGroundBlend.glsl", source: TerrainGroundBlendGlsl },
  { path: "terrain/TerrainSurfaceData.glsl", source: TerrainSurfaceDataGlsl },
  { path: "terrain/TerrainLayerEvaluation.glsl", source: TerrainLayerEvaluationGlsl },
  { path: "terrain/TerrainEvaluation.glsl", source: TerrainEvaluationGlsl },
  { path: "terrain/TerrainShadow.glsl", source: TerrainShadowGlsl },
  { path: "terrain/TerrainLighting.glsl", source: TerrainLightingGlsl },
  { path: "terrain/TerrainForwardPass.glsl", source: TerrainForwardPassGlsl }
];

/** Registers all built-in terrain GLSL includes with `ShaderFactory`. */
export function registerTerrainShaderIncludes(): void {
  for (const item of terrainShaderIncludes) {
    if (!Object.prototype.hasOwnProperty.call(ShaderFactory.includeMap, item.path)) {
      ShaderFactory.registerInclude(item.path, item.source);
    }
  }
  Shader._shaderCompiler?._setIncludeMap(ShaderFactory.includeMap);
}

/** Registers terrain GLSL includes and compiles or returns the `Terrain/Terrain` shader. */
export function registerTerrainShader(): Shader {
  registerTerrainShaderIncludes();
  return Shader.find(TERRAIN_SHADER_NAME) ?? Shader.create(TerrainShaderSource);
}
