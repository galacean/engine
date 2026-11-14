#ifndef TERRAIN_PROJECT_BILLBOARD_EVALUATION_INCLUDED
#define TERRAIN_PROJECT_BILLBOARD_EVALUATION_INCLUDED

#include "ShaderLibrary/Common/Normal.glsl"
#include "billboard/BillboardInput.glsl"
#include "shared/SceneSeason.glsl"
#include "shared/SurfaceClimate.glsl"

#ifdef RENDERER_TREE_IMPOSTOR_PALETTE
vec3 renderer_TreeImpostorPaletteColor;
#endif

SurfaceData evaluateBillboardMaterial(Varyings varyings) {
  SurfaceData surfaceData;
  vec2 materialUv = varyings.uv * material_Tiling;
  vec4 baseTexture = sampleBillboardBaseTexture(materialUv);
  applyBillboardAlphaCutoff(baseTexture.a);
  vec3 geometryNormal = normalize(varyings.normalWS);
  vec3 shadingNormal = geometryNormal;
  #ifdef MATERIAL_HAS_NORMALTEXTURE
    #ifdef NEED_VERTEX_TANGENT
      mat3 tangentToWorld = mat3(varyings.tangentWS, varyings.bitangentWS, geometryNormal);
    #else
      mat3 tangentToWorld = getTBNByDerivatives(materialUv, geometryNormal, varyings.positionWS, true);
    #endif
    vec3 tangentNormal = texture2D(material_NormalTexture, materialUv).xyz * 2.0 - 1.0;
    tangentNormal.xy *= material_NormalScale;
    tangentNormal.z = mix(1.0, tangentNormal.z, clamp(material_NormalScale, 0.0, 1.0));
    shadingNormal = normalize(tangentToWorld * tangentNormal);
  #endif

  float smoothness = material_Smoothness;
  #ifdef MATERIAL_HAS_SMOOTHNESS_TEXTURE
    smoothness *= texture2D(material_SmoothnessTexture, materialUv).g;
  #endif

  vec3 albedoColor = material_BaseColor.rgb * baseTexture.rgb;
  #ifdef RENDERER_TREE_IMPOSTOR_PALETTE
    float sourceLuminance = dot(baseTexture.rgb, vec3(0.2126, 0.7152, 0.0722));
    float foliageMask = smoothstep(0.04, 0.16, baseTexture.g - max(baseTexture.r, baseTexture.b));
    vec3 foliageColor = material_BaseColor.rgb * sourceLuminance * renderer_TreeImpostorPaletteColor;
    albedoColor = mix(albedoColor, foliageColor, foliageMask);
  #endif
  #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
    albedoColor *= varyings.assetAssemblyColor;
  #endif
  float seasonalFoliageMask = smoothstep(0.04, 0.16, baseTexture.g - max(baseTexture.r, baseTexture.b));
  vec3 barkSeasonColor = terrainProjectApplySeasonColor(
    albedoColor,
    TERRAIN_PROJECT_SEASON_SPECIES_TREE_BARK
  );
  vec3 leafSeasonColor = terrainProjectApplySeasonColor(
    albedoColor,
    TERRAIN_PROJECT_SEASON_SPECIES_TREE_LEAF
  );
  surfaceData.albedoColor = mix(barkSeasonColor, leafSeasonColor, seasonalFoliageMask);
  surfaceData.emissiveColor = vec3(0.0);
  surfaceData.metallic = 0.0;
  surfaceData.roughness = 1.0 - clamp(smoothness, 0.0, 1.0);
  surfaceData.ambientOcclusion = 1.0;
  surfaceData.opacity = 1.0;
  surfaceData.IOR = 1.5;
  surfaceData.position = varyings.positionWS;
  surfaceData.positionCS = varyings.positionCS;
  surfaceData.normal = shadingNormal;
  #ifdef NEED_TANGENT_SPACE
    surfaceData.tangent = tangentToWorld[0];
    surfaceData.bitangent = tangentToWorld[1];
  #endif
  #ifdef CAMERA_ORTHOGRAPHIC
    surfaceData.viewDir = -camera_Forward;
  #else
    surfaceData.viewDir = normalize(camera_Position - varyings.positionWS);
  #endif
  surfaceData.dotNV = clamp(dot(surfaceData.normal, surfaceData.viewDir), 0.0, 1.0);
  surfaceData.specularIntensity = 1.0;
  surfaceData.specularColor = vec3(1.0);
  terrainProjectApplySurfaceClimate(surfaceData, geometryNormal, vec3(0.52, 0.0, 0.38));
  return surfaceData;
}

#endif
