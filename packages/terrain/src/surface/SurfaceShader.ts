import { Shader, ShaderFactory } from "@galacean/engine";
import source from "../shaders/Surface.shader?raw";
import assetAssemblyAttributesSource from "../shaders/shared/AssetAssemblyAttributes.glsl?raw";
import assetAssemblyInstancingSource from "../shaders/shared/AssetAssemblyInstancing.glsl?raw";
import instancingSource from "../shaders/shared/Instancing.glsl?raw";
import proceduralTreeWindSource from "../shaders/shared/ProceduralTreeWind.glsl?raw";
import sceneWindSource from "../shaders/shared/SceneWind.glsl?raw";
import surfaceEvaluationSource from "../shaders/surface/SurfaceEvaluation.glsl?raw";
import sceneSeasonSource from "../shaders/shared/SceneSeason.glsl?raw";
import surfaceClimateSource from "../shaders/shared/SurfaceClimate.glsl?raw";
import surfaceCoverageSource from "../shaders/surface/SurfaceCoverage.glsl?raw";
import surfaceProjectionSource from "../shaders/surface/SurfaceProjection.glsl?raw";
import terrainLayerEvaluationSource from "../shaders/shared/TerrainLayerEvaluation.glsl?raw";
import terrainRegionsSource from "../shaders/shared/TerrainRegions.glsl?raw";
import grassColorFieldSource from "../shaders/shared/GrassColorField.glsl?raw";
import grassSurfaceFieldSource from "../shaders/shared/GrassSurfaceField.glsl?raw";
import lodDitherSource from "../shaders/shared/LodDither.glsl?raw";
import lightingSource from "../shaders/shared/Lighting.glsl?raw";
import shadowSource from "../shaders/shared/Shadow.glsl?raw";
import entranceWaveSource from "../shaders/shared/EntranceWave.glsl?raw";

/** Registers the common surface shader and its shared include dependencies.
 * @returns The engine-wide Surface shader definition.
 */
export function registerSurfaceShader(): Shader {
  const includes: Record<string, string> = {
    "shared/AssetAssemblyAttributes.glsl": assetAssemblyAttributesSource,
    "shared/AssetAssemblyInstancing.glsl": assetAssemblyInstancingSource,
    "shared/Instancing.glsl": instancingSource,
    "shared/ProceduralTreeWind.glsl": proceduralTreeWindSource,
    "shared/SceneWind.glsl": sceneWindSource,
    "surface/SurfaceEvaluation.glsl": surfaceEvaluationSource,
    "shared/SceneSeason.glsl": sceneSeasonSource,
    "shared/SurfaceClimate.glsl": surfaceClimateSource,
    "surface/SurfaceCoverage.glsl": surfaceCoverageSource,
    "surface/SurfaceProjection.glsl": surfaceProjectionSource,
    "shared/TerrainLayerEvaluation.glsl": terrainLayerEvaluationSource,
    "shared/TerrainRegions.glsl": terrainRegionsSource,
    "shared/GrassColorField.glsl": grassColorFieldSource,
    "shared/GrassSurfaceField.glsl": grassSurfaceFieldSource,
    "shared/LodDither.glsl": lodDitherSource,
    "shared/Lighting.glsl": lightingSource,
    "shared/Shadow.glsl": shadowSource,
    "shared/EntranceWave.glsl": entranceWaveSource
  };
  for (const [name, source] of Object.entries(includes)) {
    if (!ShaderFactory.includeMap[name]) ShaderFactory.registerInclude(name, source);
  }
  return Shader.find("Terrain/Surface") ?? Shader.create(source);
}
