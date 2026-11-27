import { Shader } from "@galacean/engine-core";
import { SOIL_MOISTURE_SHADER } from "@galacean/engine-farming/farming/presentation/soil/SoilMoistureShader";
import surfaceClimate from "@galacean/engine-terrain/shaders/shared/SurfaceClimate.glsl?raw";
import { SEED_WORLD_GRASS_SNOW_RESPONSE } from "@galacean/engine-terrain/world/SeedWorldSurfaceSnow";

export const PLANNING_FARM_SOIL_SHADER_NAME = "Farming/PlannerSoilSnow";

/** Borrow the terrain's Scene uniforms and snow functions; farming owns no climate clock or copy. */
export const PLANNING_FARM_SOIL_SHADER = SOIL_MOISTURE_SHADER.replace(
  'Shader "Farming/SoilMoisture"',
  `Shader "${PLANNING_FARM_SOIL_SHADER_NAME}"`
)
  .replace(
    '#include "ShaderLibrary/PBR/FragmentPBR.glsl"',
    `#include "ShaderLibrary/PBR/FragmentPBR.glsl"\n${surfaceClimate}`
  )
  .replace(
    "  initBSDFData(surfaceData, bsdfData);",
    `
    // Use the geometric normal for the same terrain slope mask, preserving the soil's normal map below snow.
    vec3 geometryNormal = vec3(0.0, 1.0, 0.0);
    #ifdef RENDERER_HAS_NORMAL
      geometryNormal = normalize(varyings.normalWS);
    #endif
    // Zero rain responses preserve farming's existing moisture appearance; the terrain owns every snow parameter.
    terrainProjectApplySurfaceClimate(surfaceData, geometryNormal, vec3(0.0, 0.0, ${SEED_WORLD_GRASS_SNOW_RESPONSE}));
    initBSDFData(surfaceData, bsdfData);`
  );

/** The shared shader reads scene_SurfaceClimate.z directly, so farming needs no per-plot or per-frame copy. */
export function getPlanningFarmSoilShader(): Shader {
  return Shader.find(PLANNING_FARM_SOIL_SHADER_NAME) ?? Shader.create(PLANNING_FARM_SOIL_SHADER);
}
