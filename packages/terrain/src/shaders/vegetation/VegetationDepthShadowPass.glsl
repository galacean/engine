#ifndef TERRAIN_PROJECT_VEGETATION_DEPTH_SHADOW_PASS_INCLUDED
#define TERRAIN_PROJECT_VEGETATION_DEPTH_SHADOW_PASS_INCLUDED

#include "ShaderLibrary/Common/Common.glsl"
#include "ShaderLibrary/Common/Transform.glsl"
#ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
  #include "shared/AssetAssemblyAttributes.glsl"
#elif defined(RENDERER_DETAIL_INSTANCE) || defined(RENDERER_SEED_WORLD_DETAIL_COMPACT)
  #include "vegetation/VegetationDetailAttributes.glsl"
#else
  #include "vegetation/VegetationAttributes.glsl"
  #include "ShaderLibrary/Skin/Skin.glsl"
  #include "ShaderLibrary/Skin/BlendShape.glsl"
#endif
#ifdef RENDERER_PROCEDURAL_TREE_GPU_LEAF_FRAME
  #include "vegetation/ProceduralTreeLeafFrame.glsl"
#endif

#ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
  #include "shared/AssetAssemblyInstancing.glsl"
#endif

struct Varyings {
  vec2 uv;
  vec3 sourcePositionWS;
  vec3 positionWS;
  #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
    float assetAssemblyLodFade;
  #endif
  #ifdef RENDERER_GENERATION_REVEAL
    vec4 generationRevealData;
    #if defined(MATERIAL_PROCEDURAL_TREE_DENSITY_TRANSITION) && defined(RENDERER_PROCEDURAL_TREE_VARIATION_CATALOG) && defined(RENDERER_ASSET_ASSEMBLY_INSTANCE)
      vec3 treeDissolveTint;
    #endif
  #endif
  #if defined(RENDERER_PROCEDURAL_TREE_LEAF_MASK_LIBRARY) && defined(RENDERER_ASSET_ASSEMBLY_INSTANCE)
    float proceduralLeafShape;
  #endif
};

#include "vegetation/VegetationInput.glsl"
#include "shared/VegetationWind.glsl"
#include "shared/LodDither.glsl"
#include "shared/EntranceWave.glsl"
#ifdef TERRAIN_PROJECT_SHADOW_CASTER_PASS
  #include "shared/Shadow.glsl"
#endif

#if defined(RENDERER_PROCEDURAL_TREE_LEAF_BILLBOARD) && defined(RENDERER_PROCEDURAL_TREE_GPU_LEAF_FRAME)
  #include "vegetation/ProceduralTreeLeafBillboard.glsl"
#endif

Varyings terrainProjectBuildVegetationDepthShadowVaryings(Attributes attributes) {
  Varyings varyings;
  vec4 positionOS = vec4(attributes.POSITION, 1.0);
  #ifdef RENDERER_HAS_NORMAL
    vec3 normalOS = attributes.NORMAL;
    #ifdef RENDERER_HAS_TANGENT
      vec4 tangentOS = attributes.TANGENT;
    #endif
  #else
    vec3 normalOS = vec3(0.0, 1.0, 0.0);
  #endif

  #if defined(RENDERER_HAS_BLENDSHAPE) && !defined(RENDERER_DETAIL_INSTANCE) && \
    !defined(RENDERER_SEED_WORLD_DETAIL_COMPACT) && \
    !defined(RENDERER_ASSET_ASSEMBLY_INSTANCE)
    calculateBlendShape(
      attributes,
      positionOS
      #ifdef RENDERER_HAS_NORMAL
        , normalOS
        #ifdef RENDERER_HAS_TANGENT
          , tangentOS
        #endif
      #endif
    );
  #endif
  #if defined(RENDERER_HAS_SKIN) && !defined(RENDERER_DETAIL_INSTANCE) && \
    !defined(RENDERER_SEED_WORLD_DETAIL_COMPACT) && \
    !defined(RENDERER_ASSET_ASSEMBLY_INSTANCE)
    mat4 skinMatrix = getSkinMatrix(attributes);
    positionOS = skinMatrix * positionOS;
    #ifdef RENDERER_HAS_NORMAL
      normalOS = normalOS * INVERSE_MAT(mat3(skinMatrix));
    #endif
  #endif

  vec3 proceduralTreeWindOriginOS = vec3(0.0);
  #ifdef RENDERER_PROCEDURAL_TREE_GPU_LEAF_FRAME
    ProceduralTreeLeafFrame proceduralLeafFrame = terrainProjectProceduralTreeLeafFrame(attributes);
    positionOS.xyz = terrainProjectProceduralTreeLeafPositionOS(proceduralLeafFrame, attributes.LEAF_SHAPE_POSITION);
    normalOS = terrainProjectProceduralTreeLeafNormalOS(proceduralLeafFrame, attributes.LEAF_SHAPE_NORMAL);
    normalOS = terrainProjectProceduralTreeLeafShadingNormalOS(positionOS.xyz, normalOS);
    proceduralTreeWindOriginOS = proceduralLeafFrame.pivotOS;
  #elif defined(MATERIAL_WIND_PROCEDURAL_TREE)
    proceduralTreeWindOriginOS = attributes.LEAF_PIVOT;
  #endif
  normalOS = normalize(mix(normalOS, vec3(0.0, 1.0, 0.0), material_LightingFlatness));
  #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
    normalOS = terrainProjectAssetAssemblyNormalOS(normalOS, attributes);
    #if defined(RENDERER_HAS_NORMAL) && defined(RENDERER_HAS_TANGENT)
      tangentOS.xyz = terrainProjectAssetAssemblyTangentOS(tangentOS.xyz, attributes);
    #endif
    varyings.assetAssemblyLodFade = terrainProjectAssetAssemblyLodFade(attributes);
  #else
    normalOS = terrainProjectDetailNormalOS(normalOS, attributes);
    #if defined(RENDERER_HAS_NORMAL) && defined(RENDERER_HAS_TANGENT)
      tangentOS.xyz = terrainProjectDetailTangentOS(tangentOS.xyz, attributes);
    #endif
  #endif
  #ifdef RENDERER_HAS_UV
    varyings.uv = attributes.TEXCOORD_0 * material_Tiling;
  #else
    varyings.uv = vec2(0.0);
  #endif
  #if defined(RENDERER_PROCEDURAL_TREE_LEAF_MASK_LIBRARY) && defined(RENDERER_ASSET_ASSEMBLY_INSTANCE)
    varyings.proceduralLeafShape = terrainProjectProceduralTreeLeafShape(attributes);
  #endif
  vec3 normalWS;
  vec3 tangentWS = vec3(0.0);
  float windShadingResponse;
  vec3 groundWindDiagnostics;
  vec3 groundWindCarrierNormalWS;
  vec3 positionWS;
  #if defined(RENDERER_PROCEDURAL_TREE_LEAF_BILLBOARD) && defined(RENDERER_PROCEDURAL_TREE_GPU_LEAF_FRAME)
    vec3 leafOriginWS;
    terrainProjectBuildProceduralTreeLeafFrame(
      attributes,
      positionWS,
      normalWS,
      tangentWS,
      leafOriginWS
    );
    positionWS = terrainProjectApplyVegetationWind(
      positionWS,
      leafOriginWS,
      attributes,
      normalWS,
      tangentWS,
      windShadingResponse,
      groundWindDiagnostics,
      groundWindCarrierNormalWS
    );
  #else
    normalWS = normalize(mat3(renderer_NormalMat) * normalOS);
    positionWS = terrainProjectVegetationPositionWS(
      positionOS,
      attributes,
      proceduralTreeWindOriginOS,
      normalWS,
      tangentWS,
      windShadingResponse,
      groundWindDiagnostics,
      groundWindCarrierNormalWS
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
  varyings.positionWS = positionWS;
  #ifdef TERRAIN_PROJECT_SHADOW_CASTER_PASS
    gl_Position = terrainProjectShadowClipPosition(applyTerrainProjectShadowBias(positionWS, normalWS));
  #else
    gl_Position = camera_VPMat * vec4(positionWS, 1.0);
  #endif
  return varyings;
}

void terrainProjectDiscardInvalidVegetationDepthShadow(Varyings varyings) {
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
  #if defined(MATERIAL_HAS_BASETEXTURE) || defined(RENDERER_PROCEDURAL_TREE_LEAF_MASK_LIBRARY)
    float alphaCoverage = 1.0;
    #ifdef MATERIAL_VEGETATION_CLIMATE_LEAF
      vec3 geometricFaceNormal = normalize(cross(dFdx(varyings.positionWS), dFdy(varyings.positionWS)));
      vec3 coverageViewDirection = normalize(camera_Position - varyings.positionWS);
      float grazingVisibility = abs(dot(geometricFaceNormal, coverageViewDirection));
      alphaCoverage = mix(
        1.0,
        grazingVisibility,
        clamp(material_LeafGlancingAngleCut, 0.0, 1.0)
      );
    #endif
    #if defined(RENDERER_PROCEDURAL_TREE_LEAF_MASK_LIBRARY) && defined(RENDERER_ASSET_ASSEMBLY_INSTANCE)
      applyVegetationAlphaCutoff(
        sampleProceduralTreeLeafMask(varyings.uv, varyings.proceduralLeafShape).a * alphaCoverage
      );
    #else
      applyVegetationAlphaCutoff(sampleVegetationAlpha(varyings.uv) * alphaCoverage);
    #endif
  #endif
}

#ifdef TERRAIN_PROJECT_SHADOW_CASTER_PASS
  Varyings VegetationShadowVertex(Attributes attributes) {
    return terrainProjectBuildVegetationDepthShadowVaryings(attributes);
  }

  void VegetationShadowFragment(Varyings varyings) {
    terrainProjectDiscardInvalidVegetationDepthShadow(varyings);
    gl_FragColor = terrainProjectShadowColor();
  }
#else
  Varyings VegetationDepthOnlyVertex(Attributes attributes) {
    return terrainProjectBuildVegetationDepthShadowVaryings(attributes);
  }

  void VegetationDepthOnlyFragment(Varyings varyings) {
    terrainProjectDiscardInvalidVegetationDepthShadow(varyings);
  }
#endif

#endif
