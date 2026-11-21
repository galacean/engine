#ifndef TERRAIN_PROJECT_SURFACE_DEPTH_SHADOW_PASS_INCLUDED
#define TERRAIN_PROJECT_SURFACE_DEPTH_SHADOW_PASS_INCLUDED

#include "ShaderLibrary/Common/Common.glsl"
#include "ShaderLibrary/Common/Transform.glsl"
#ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
  #include "shared/AssetAssemblyAttributes.glsl"

  #include "shared/AssetAssemblyInstancing.glsl"
  #if defined(MATERIAL_WIND_PROCEDURAL_TREE) && defined(RENDERER_ASSET_ASSEMBLY_INSTANCE)
    #include "shared/ProceduralTreeWind.glsl"
  #endif
#else
  #include "ShaderLibrary/Common/Attributes.glsl"
  #include "ShaderLibrary/Skin/Skin.glsl"
  #include "ShaderLibrary/Skin/BlendShape.glsl"
#endif
#include "shared/LodDither.glsl"
#include "shared/EntranceWave.glsl"
#ifdef TERRAIN_PROJECT_SHADOW_CASTER_PASS
  #include "shared/Shadow.glsl"
#endif

#ifdef MATERIAL_SURFACE_ALPHA_CLIP
  #ifdef MATERIAL_HAS_BASETEXTURE
    sampler2D material_BaseTexture;
  #endif
  float material_Tiling;
  #ifdef MATERIAL_HAS_UV_SCALE
    vec2 material_UvScale;
  #endif
#endif
struct SurfaceDepthShadowVaryings {
  #ifdef MATERIAL_SURFACE_ALPHA_CLIP
    vec2 uv;
  #endif
  vec3 sourcePositionWS;
  #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
    float assetAssemblyLodFade;
  #endif
  #ifdef RENDERER_GENERATION_REVEAL
    vec4 generationRevealData;
    #if defined(MATERIAL_PROCEDURAL_TREE_DENSITY_TRANSITION) && defined(RENDERER_PROCEDURAL_TREE_VARIATION_CATALOG) && defined(RENDERER_ASSET_ASSEMBLY_INSTANCE)
      vec3 treeDissolveTint;
    #endif
  #endif
};

SurfaceDepthShadowVaryings terrainProjectBuildSurfaceDepthShadowVaryings(Attributes attributes) {
  SurfaceDepthShadowVaryings varyings;
  #ifdef MATERIAL_SURFACE_ALPHA_CLIP
    #ifdef RENDERER_HAS_UV
      varyings.uv = attributes.TEXCOORD_0 * material_Tiling;
      #ifdef MATERIAL_HAS_UV_SCALE
        varyings.uv *= material_UvScale;
      #endif
      #if defined(RENDERER_PROCEDURAL_TREE_BARK_UV_SCALE) && defined(RENDERER_ASSET_ASSEMBLY_INSTANCE)
        #ifdef RENDERER_PROCEDURAL_TREE_VARIATION_CATALOG
          varyings.uv *= terrainProjectProceduralTreeBarkUvScaleFromInstance(attributes);
        #else
          varyings.uv *= terrainProjectProceduralTreeBarkUvScale();
        #endif
      #endif
    #else
      varyings.uv = vec2(0.0);
    #endif
  #endif
  vec4 positionOS = vec4(attributes.POSITION, 1.0);
  #ifdef RENDERER_HAS_NORMAL
    vec3 normalOS = attributes.NORMAL;
    #if defined(RENDERER_HAS_TANGENT) && defined(RENDERER_HAS_NORMAL)
      vec4 tangentOS = attributes.TANGENT;
    #endif
  #else
    vec3 normalOS = vec3(0.0, 1.0, 0.0);
  #endif

  #if defined(RENDERER_HAS_BLENDSHAPE) && !defined(RENDERER_ASSET_ASSEMBLY_INSTANCE)
    calculateBlendShape(
      attributes,
      positionOS
      #ifdef RENDERER_HAS_NORMAL
        , normalOS
        #if defined(RENDERER_HAS_TANGENT) && defined(RENDERER_HAS_NORMAL)
          , tangentOS
        #endif
      #endif
    );
  #endif
  #if defined(RENDERER_HAS_SKIN) && !defined(RENDERER_ASSET_ASSEMBLY_INSTANCE)
    mat4 skinMatrix = getSkinMatrix(attributes);
    positionOS = skinMatrix * positionOS;
    #ifdef RENDERER_HAS_NORMAL
      normalOS = normalOS * INVERSE_MAT(mat3(skinMatrix));
    #endif
  #endif

  #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
    positionOS.xyz = terrainProjectAssetAssemblyPositionOS(positionOS.xyz, attributes);
    normalOS = terrainProjectAssetAssemblyNormalOS(normalOS, attributes);
    varyings.assetAssemblyLodFade = terrainProjectAssetAssemblyLodFade(attributes);
  #endif
  vec3 positionWS = (renderer_ModelMat * positionOS).xyz;
  vec3 normalWS = normalize(mat3(renderer_NormalMat) * normalOS);
  #if defined(MATERIAL_WIND_PROCEDURAL_TREE) && defined(RENDERER_ASSET_ASSEMBLY_INSTANCE)
    vec3 proceduralTreeOriginOS = terrainProjectAssetAssemblyOriginOS(attributes);
    vec3 proceduralTreeOriginWS = (renderer_ModelMat * vec4(proceduralTreeOriginOS, 1.0)).xyz;
    vec3 proceduralTreeTangentWS = vec3(0.0);
    float proceduralTreeWindShadingResponse;
    vec3 proceduralTreeGroundWindDiagnostics;
    vec3 proceduralTreeGroundWindCarrierNormalWS;
    positionWS = terrainProjectApplyProceduralTreeWind(
      positionWS,
      proceduralTreeOriginWS,
      attributes,
      normalWS,
      proceduralTreeTangentWS,
      proceduralTreeWindShadingResponse,
      proceduralTreeGroundWindDiagnostics,
      proceduralTreeGroundWindCarrierNormalWS
    );
  #endif
  varyings.sourcePositionWS = positionWS;
  #ifdef RENDERER_GENERATION_REVEAL
    #if defined(MATERIAL_PROCEDURAL_TREE_DENSITY_TRANSITION) && defined(RENDERER_PROCEDURAL_TREE_VARIATION_CATALOG) && defined(RENDERER_ASSET_ASSEMBLY_INSTANCE)
      varyings.treeDissolveTint = material_TreeDissolvePalette[terrainProjectProceduralTreeCatalogIndex(attributes)].rgb;
    #endif
    varyings.generationRevealData = terrainProjectGenerationRevealData(positionWS.y, attributes);
  #endif
  #ifdef TERRAIN_PROJECT_ENTRANCE_WAVE
    positionWS = terrainProjectApplyEntranceWavePosition(positionWS);
  #endif
  #ifdef RENDERER_GENERATION_REVEAL
    positionWS = terrainProjectApplyGenerationRevealPosition(positionWS, varyings.generationRevealData);
  #endif
  #ifdef TERRAIN_PROJECT_SHADOW_CASTER_PASS
    gl_Position = terrainProjectShadowClipPosition(applyTerrainProjectShadowBias(positionWS, normalWS));
  #else
    gl_Position = camera_VPMat * vec4(positionWS, 1.0);
  #endif
  return varyings;
}

void terrainProjectDiscardInvalidSurfaceDepthShadow(SurfaceDepthShadowVaryings varyings) {
  #if defined(MATERIAL_SURFACE_ALPHA_CLIP) && defined(MATERIAL_HAS_BASETEXTURE)
    if (texture2D(material_BaseTexture, varyings.uv).a < 0.5) discard;
  #endif
  #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
    applyTerrainProjectInstanceLodDither(gl_FragCoord.xy, varyings.assetAssemblyLodFade);
  #else
    applyTerrainProjectLodDither(gl_FragCoord.xy);
  #endif
  #ifdef TERRAIN_PROJECT_ENTRANCE_WAVE
    if (terrainProjectEntranceWaveReveal(varyings.sourcePositionWS) <= 0.001) discard;
  #endif
  #ifdef RENDERER_GENERATION_REVEAL
    if (terrainProjectGenerationRevealAmount(varyings.generationRevealData) <= 0.001) discard;
  #endif
}

#ifdef TERRAIN_PROJECT_SHADOW_CASTER_PASS
  SurfaceDepthShadowVaryings SurfaceShadowVertex(Attributes attributes) {
    return terrainProjectBuildSurfaceDepthShadowVaryings(attributes);
  }

  void SurfaceShadowFragment(SurfaceDepthShadowVaryings varyings) {
    terrainProjectDiscardInvalidSurfaceDepthShadow(varyings);
    gl_FragColor = terrainProjectShadowColor();
  }
#else
  SurfaceDepthShadowVaryings SurfaceDepthOnlyVertex(Attributes attributes) {
    return terrainProjectBuildSurfaceDepthShadowVaryings(attributes);
  }

  void SurfaceDepthOnlyFragment(SurfaceDepthShadowVaryings varyings) {
    terrainProjectDiscardInvalidSurfaceDepthShadow(varyings);
  }
#endif

#endif
