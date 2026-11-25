#ifndef TERRAIN_PROJECT_LIGHTING_INCLUDED
#define TERRAIN_PROJECT_LIGHTING_INCLUDED

#include "ShaderLibrary/PBR/LightDirectPBR.glsl"
#include "ShaderLibrary/PBR/LightIndirectPBR.glsl"
#include "ShaderLibrary/Common/OilPaintBrush.glsl"
#include "shared/Shadow.glsl"

struct TerrainProjectLightingResult {
  vec3 directDiffuse;
  vec3 directSpecular;
  vec3 environmentDiffuse;
  vec3 environmentSpecular;
  float shadowAttenuation;
};

#ifndef TERRAIN_PROJECT_PREPARE_ALBEDO
  #define TERRAIN_PROJECT_PREPARE_ALBEDO(viewDirection, albedoColor, shadowAttenuation) albedoColor
#endif

vec3 terrainProjectEvaluateSpecularIBL(SurfaceData surfaceData, BSDFData bsdfData, vec3 radiance) {
  float specularAO = evaluateSpecularOcclusion(surfaceData.dotNV, bsdfData.diffuseAO, bsdfData.roughness);
  return specularAO * radiance *
    envBRDFApprox(bsdfData.resolvedSpecularF0, bsdfData.specularF90, bsdfData.roughness, surfaceData.dotNV) *
    bsdfData.energyCompensation;
}

TerrainProjectLightingResult evaluateTerrainProjectLightingWithShadow(Varyings varyings, SurfaceData surfaceData, float shadowAttenuation) {
  TerrainProjectLightingResult result;
  result.directDiffuse = vec3(0.0);
  result.directSpecular = vec3(0.0);
  result.environmentDiffuse = vec3(0.0);
  result.environmentSpecular = vec3(0.0);
  result.shadowAttenuation = shadowAttenuation;
  surfaceData.albedoColor = TERRAIN_PROJECT_PREPARE_ALBEDO(
    surfaceData.viewDir,
    surfaceData.albedoColor,
    result.shadowAttenuation
  );
  #ifdef SCENE_OIL_PAINT_STYLE
    #ifdef TERRAIN_PROJECT_SURFACE_EVALUATION_INCLUDED
      float oilBrushScale = 0.32;
      float oilPaletteStrength = 0.0;
    #else
      float oilBrushScale = 0.42;
      float oilPaletteStrength = 0.80;
    #endif
    applyOilPaintBrushSurface(
      surfaceData.position,
      surfaceData.normal,
      oilBrushScale,
      oilPaletteStrength,
      surfaceData.albedoColor,
      surfaceData.normal,
      surfaceData.roughness
    );
  #endif

  BSDFData bsdfData;
  initBSDFData(surfaceData, bsdfData);

  float directShadowAttenuation = result.shadowAttenuation;
  #if (defined(RENDERER_PROCEDURAL_TREE_GPU_LEAF_FRAME) || defined(RENDERER_PROCEDURAL_PLANT_CANOPY_OCCLUSION)) && defined(MATERIAL_PROCEDURAL_TREE_CANOPY_OCCLUSION)
    // Shadow maps own resolved near-field visibility. As their engine-authored fade
    // reaches one, the main directional light transfers to the generator's conserved
    // canopy proxy instead of letting distant crowns become uniformly sunlit.
    float canopyDirectFallbackWeight = 1.0;
    #ifdef NEED_CALCULATE_SHADOWS
      canopyDirectFallbackWeight = getShadowFade(varyings.positionWS);
    #endif
    float canopyDirectVisibility = mix(
      1.0,
      clamp(surfaceData.ambientOcclusion, 0.0, 1.0),
      canopyDirectFallbackWeight
    );
    #ifdef NEED_CALCULATE_SHADOWS
      directShadowAttenuation *= canopyDirectVisibility;
    #endif
  #endif
  evaluateDirectRadiance(
    varyings,
    surfaceData,
    bsdfData,
    directShadowAttenuation,
    result.directDiffuse,
    result.directSpecular
  );
  #if (defined(RENDERER_PROCEDURAL_TREE_GPU_LEAF_FRAME) || defined(RENDERER_PROCEDURAL_PLANT_CANOPY_OCCLUSION)) && \
    defined(MATERIAL_PROCEDURAL_TREE_CANOPY_OCCLUSION) && !defined(NEED_CALCULATE_SHADOWS)
    result.directDiffuse *= canopyDirectVisibility;
    result.directSpecular *= canopyDirectVisibility;
  #endif
  #ifdef TERRAIN_PROJECT_WATER_LAYER
    // Terrain owns a separated water-film layer; sample SSR exclusively on the water film, not the substrate.
    evaluateDiffuseIBL(varyings, surfaceData, bsdfData, result.environmentDiffuse);
    vec3 substrateRadiance = getLightProbeRadiance(surfaceData, surfaceData.normal, bsdfData.roughness);
    result.environmentSpecular += terrainProjectEvaluateSpecularIBL(surfaceData, bsdfData, substrateRadiance);
  #else
    evaluateIBL(
      varyings,
      surfaceData,
      bsdfData,
      result.environmentDiffuse,
      result.environmentSpecular
    );
  #endif
  return result;
}

#ifndef TERRAIN_PROJECT_GROUND_SHADOW_PCF
TerrainProjectLightingResult evaluateTerrainProjectLighting(Varyings varyings, SurfaceData surfaceData) {
  return evaluateTerrainProjectLightingWithShadow(varyings, surfaceData, sampleTerrainProjectShadow(varyings));
}
#endif

TerrainProjectLightingResult terrainProjectCreateLightingResult() {
  TerrainProjectLightingResult result;
  result.directDiffuse = vec3(0.0);
  result.directSpecular = vec3(0.0);
  result.environmentDiffuse = vec3(0.0);
  result.environmentSpecular = vec3(0.0);
  result.shadowAttenuation = 1.0;
  return result;
}

void terrainProjectAccumulateLighting(
  inout TerrainProjectLightingResult total,
  TerrainProjectLightingResult contribution,
  float weight
) {
  total.directDiffuse += contribution.directDiffuse * weight;
  total.directSpecular += contribution.directSpecular * weight;
  total.environmentDiffuse += contribution.environmentDiffuse * weight;
  total.environmentSpecular += contribution.environmentSpecular * weight;
  total.shadowAttenuation = contribution.shadowAttenuation;
}

#ifdef TERRAIN_PROJECT_WATER_LAYER
  void terrainProjectApplyWaterFilmLighting(
    Varyings varyings,
    SurfaceData substrate,
    TerrainProjectWaterFilm waterFilm,
    float ssrDepthSlope,
    inout TerrainProjectLightingResult result
  ) {
    if (waterFilm.coverage > 0.0) {
      // The water interface transmits the remaining energy to the already evaluated substrate.
      // Terrain owns this water-film interface explicitly and evaluates it with the standard BSDF.
      float waterFresnel = F_Schlick(terrainProjectWaterF0(), 1.0, waterFilm.dotNV);
      float substrateTransmission = 1.0 - waterFilm.coverage * waterFresnel;
      result.directDiffuse *= substrateTransmission;
      result.directSpecular *= substrateTransmission;
      result.environmentDiffuse *= substrateTransmission;
      result.environmentSpecular *= substrateTransmission;

      SurfaceData waterSurface = terrainProjectBuildWaterFilmSurface(substrate, waterFilm);
      BSDFData waterBsdfData;
      initBSDFData(waterSurface, waterBsdfData);
      vec3 unusedDiffuse = vec3(0.0);
      vec3 directSpecular = vec3(0.0);
      float shadowAttenuation = result.shadowAttenuation;
      evaluateDirectRadiance(
        varyings,
        waterSurface,
        waterBsdfData,
        shadowAttenuation,
        unusedDiffuse,
        directSpecular
      );
      vec3 radiance = getLightProbeRadiance(waterSurface, waterSurface.normal, waterBsdfData.roughness);
      #ifdef CAMERA_ENABLE_SSR
        float ssrMix = saturate(scene_TerrainWaterCoverageParams.w);
        if (ssrMix > 0.0 && waterFilm.coverage > 0.005) {
          float ssrFragEyeDepth = remapDepthBufferEyeDepth(gl_FragCoord.z);
          vec3 ssrRadiance = evaluateScreenSpaceReflectionWithDepth(
            varyings.positionCS,
            waterSurface.normal,
            waterBsdfData.roughness,
            radiance,
            ssrFragEyeDepth,
            ssrDepthSlope
          );
          radiance = mix(radiance, ssrRadiance, ssrMix);
        }
      #endif
      vec3 environmentSpecular = terrainProjectEvaluateSpecularIBL(waterSurface, waterBsdfData, radiance);
      float reflectionIntensity = scene_TerrainWaterCoverageParams.z;
      result.directSpecular += directSpecular * waterFilm.coverage * reflectionIntensity;
      result.environmentSpecular += environmentSpecular * waterFilm.coverage * reflectionIntensity;
    }
  }
#endif

vec3 terrainProjectFinalLighting(TerrainProjectLightingResult result) {
  return result.directDiffuse + result.directSpecular + result.environmentDiffuse + result.environmentSpecular;
}

#endif
