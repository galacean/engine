#ifndef TERRAIN_PROJECT_VEGETATION_EVALUATION_INCLUDED
#define TERRAIN_PROJECT_VEGETATION_EVALUATION_INCLUDED

#include "ShaderLibrary/Common/Normal.glsl"
#include "vegetation/VegetationInput.glsl"
#include "shared/SceneSeason.glsl"
#include "shared/SurfaceClimate.glsl"

// Materials own physical weather-response coefficients; SceneSeason owns seasonal colour.
vec4 material_SnowResponse;

#if defined(MATERIAL_VEGETATION_SHARED_GRASS_APPEARANCE) || defined(MATERIAL_VEGETATION_SHARED_GRASS_COLOR)
  #include "shared/GrassColorField.glsl"
#endif

#ifdef MATERIAL_VEGETATION_SHARED_GRASS_APPEARANCE
  #include "shared/GrassGroundFusion.glsl"
  #include "shared/TerrainGroundBlend.glsl"
  #include "shared/GrassTerrainSurface.glsl"
  #include "shared/FarmGroundBlend.glsl"
  sampler2D material_GrassTerrainNormalAtlas;
  vec2 material_GrassTerrainNormalAtlasInvSize;
  vec4 material_GrassTerrainNormalRects[TERRAIN_PROJECT_MAX_ACTIVE_REGIONS];

  vec3 terrainProjectSharedGrassGroundNormal(vec2 worldXZ) {
    int region = terrainProjectRegionIndex(worldXZ);
    if (region < 0) return vec3(0.0, 1.0, 0.0);
    vec2 encodedXZ = texture2D(material_GrassTerrainNormalAtlas, terrainProjectGroundAtlasUv(
      material_GrassTerrainNormalAtlasInvSize, material_GrassTerrainNormalRects[region],
      GROUND_TerrainRegionWorldBounds[region], worldXZ)).rg * 2.0 - 1.0;
    return normalize(vec3(encodedXZ.x, sqrt(max(1.0 - dot(encodedXZ, encodedXZ), 0.0)), encodedXZ.y));
  }

  SurfaceData terrainProjectEvaluateSharedGrassSurface(Varyings varyings) {
    float tipWeight = varyings.sharedGrassRootTip.w;
    float appearanceWeight = terrainProjectGrassBladeAppearanceWeight(tipWeight);
    vec3 groundPositionWS = vec3(varyings.positionWS.x, varyings.sharedGrassRootTip.y, varyings.positionWS.z);
    TerrainProjectLayerBlend ground = terrainProjectGroundSurface(groundPositionWS);
    vec3 nearColor = evaluateGrassBaseColor(groundPositionWS.xz);
    vec3 farColor = evaluateGrassFarBaseColor(groundPositionWS.xz);
    #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
      nearColor = mix(nearColor, varyings.assetAssemblyColor, varyings.sharedGrassColorOverrideMask);
      farColor = mix(farColor, varyings.assetAssemblyColor, varyings.sharedGrassColorOverrideMask);
    #endif
    vec3 groundColor = terrainProjectGroundColor(ground, groundPositionWS);
    groundColor = terrainProjectBlendFarmGroundColor(groundColor, groundPositionWS.xz);
    vec3 groundNormal = terrainProjectSharedGrassGroundNormal(varyings.sharedGrassRootTip.xz);
    vec3 carrierNormal = vec3(0.0, 1.0, 0.0);
    #ifdef MATERIAL_WIND_GROUND_VEGETATION
      carrierNormal = varyings.groundWindCarrierNormalWS;
    #endif
    vec3 windNormal = terrainProjectGrassWindFieldNormal(groundNormal, carrierNormal, normalize(varyings.normalWS));
    vec3 shadingNormal = normalize(mix(groundNormal, windNormal, terrainProjectGrassBladeShadeWeight(tipWeight)));
    SurfaceData surfaceData = terrainProjectBuildSurfaceData(varyings,
      mix(groundColor, nearColor, appearanceWeight), shadingNormal, 0.0, 0.0, 1.0);
    float groundSnowResponse = ground.snowResponse;
    float snowResponse = mix(groundSnowResponse, material_SnowResponse.x, appearanceWeight);
    terrainProjectApplySurfaceClimate(surfaceData,
      normalize(mix(groundNormal, windNormal, appearanceWeight)), vec3(1.0, 0.0, snowResponse));
    return surfaceData;
  }
#endif

float terrainProjectVegetationLeafSnowMask(float sourcePositionY) {
  float verticalSnow = smoothstep(material_SnowResponse.y, material_SnowResponse.z, sourcePositionY);
  return clamp(scene_SurfaceClimate.z * material_SnowResponse.w * verticalSnow, 0.0, 1.0);
}

float terrainProjectVegetationShrubSnowMask(vec3 worldPosition, vec3 geometryNormal) {
  float snowStorage = clamp(scene_SurfaceClimate.z * material_SnowResponse.x, 0.0, 1.0);
  float distribution = terrainProjectSurfaceClimateNoise(worldPosition.xz);
  float snowDistribution = smoothstep(0.34, 0.76, snowStorage + (distribution - 0.5) * 0.42);
  float upward = clamp(normalize(geometryNormal).y, 0.0, 1.0);
  float slope = pow(clamp(upward + material_SnowResponse.y, 0.0, 1.0), max(material_SnowResponse.z, 0.01));
  return clamp(snowDistribution * slope * material_SnowResponse.w, 0.0, 1.0);
}

float terrainProjectVegetationGrassSnowMask(vec3 worldPosition) {
  float snowStorage = clamp(scene_SurfaceClimate.z * material_SnowResponse.x, 0.0, 1.0);
  float broadPatch = terrainProjectSurfaceClimateValueNoise(worldPosition.xz * 0.018 + vec2(7.3, 31.9));
  float localPatch = terrainProjectSurfaceClimateValueNoise(worldPosition.xz * 0.075 + vec2(53.1, 11.7));
  float distribution = mix(broadPatch, localPatch, 0.32);
  float patchSnow = smoothstep(0.28, 0.64, snowStorage + (distribution - 0.5) * 0.72);
  float accumulationGate = smoothstep(0.04, 0.22, snowStorage);
  return clamp(patchSnow * accumulationGate * material_SnowResponse.w, 0.0, 1.0);
}

void terrainProjectApplyVegetationGrassClimate(inout SurfaceData surfaceData, vec3 geometryNormal) {
  float snow = terrainProjectVegetationGrassSnowMask(surfaceData.position);
  vec3 grassSnowColor = scene_SurfaceSnowColor.rgb * vec3(0.86, 0.93, 1.0);
  surfaceData.albedoColor = mix(surfaceData.albedoColor, grassSnowColor, snow);
  surfaceData.roughness = mix(surfaceData.roughness, 0.78, snow);
  surfaceData.specularIntensity = mix(surfaceData.specularIntensity, 0.7, snow);
  surfaceData.normal = normalize(mix(surfaceData.normal, normalize(geometryNormal), snow * 0.08));
  surfaceData.dotNV = clamp(dot(surfaceData.normal, surfaceData.viewDir), 0.0, 1.0);
}

void terrainProjectApplyVegetationLeafClimate(
  inout SurfaceData surfaceData,
  vec3 geometryNormal,
  float sourcePositionY
) {
  float snow = terrainProjectVegetationLeafSnowMask(sourcePositionY);
  vec3 leafSnowColor = scene_SurfaceSnowColor.rgb;
  surfaceData.albedoColor = mix(surfaceData.albedoColor, leafSnowColor, snow);
  surfaceData.roughness = mix(surfaceData.roughness, 0.74, snow);
  surfaceData.specularIntensity = mix(surfaceData.specularIntensity, 0.72, snow);
  surfaceData.normal = normalize(mix(surfaceData.normal, normalize(geometryNormal), snow * 0.16));
  surfaceData.dotNV = clamp(dot(surfaceData.normal, surfaceData.viewDir), 0.0, 1.0);
}

void terrainProjectApplyVegetationShrubClimate(inout SurfaceData surfaceData, vec3 geometryNormal) {
  float snow = terrainProjectVegetationShrubSnowMask(surfaceData.position, geometryNormal);
  vec3 leafSnowColor = scene_SurfaceSnowColor.rgb * vec3(0.78, 0.88, 1.0);
  surfaceData.albedoColor = mix(surfaceData.albedoColor, leafSnowColor, snow);
  surfaceData.roughness = mix(surfaceData.roughness, 0.74, snow);
  surfaceData.specularIntensity = mix(surfaceData.specularIntensity, 0.72, snow);
  surfaceData.normal = normalize(mix(surfaceData.normal, normalize(geometryNormal), snow * 0.16));
  surfaceData.dotNV = clamp(dot(surfaceData.normal, surfaceData.viewDir), 0.0, 1.0);
}

void terrainProjectApplyVegetationBranchClimate(inout SurfaceData surfaceData, vec3 geometryNormal) {
  surfaceData.dotNV = clamp(dot(surfaceData.normal, surfaceData.viewDir), 0.0, 1.0);
}

void terrainProjectApplyVegetationWetness(inout SurfaceData surfaceData, vec3 geometryNormal) {
  terrainProjectApplySurfaceMoisture(surfaceData, geometryNormal, vec2(0.72, 0.0));
  surfaceData.dotNV = clamp(dot(surfaceData.normal, surfaceData.viewDir), 0.0, 1.0);
}

vec3 terrainProjectEvaluateLeafAlbedo(vec3 textureColor, vec3 tint) {
  float sampledLuminance = dot(textureColor, vec3(0.299, 0.587, 0.114));
  vec3 sampledAlbedo = mix(
    textureColor,
    vec3(sampledLuminance),
    clamp(material_LeafAlbedoDesaturation, 0.0, 1.0)
  ) * max(material_LeafAlbedoBrightness, 0.0);
  vec3 overlayLow = 2.0 * tint * sampledAlbedo;
  vec3 overlayHigh = 1.0 - 2.0 * (1.0 - tint) * (1.0 - sampledAlbedo);
  vec3 overlayAlbedo = clamp(mix(overlayLow, overlayHigh, step(vec3(0.5), tint)), 0.0, 1.0);
  return mix(tint, overlayAlbedo, clamp(material_LeafAlbedoTextureBlend, 0.0, 1.0));
}

SurfaceData evaluateVegetationMaterial(Varyings varyings, bool isFrontFacing, float alphaCoverage) {
  SurfaceData surfaceData;
  vec2 materialUv = varyings.uv * material_Tiling;
  #ifdef RENDERER_PROCEDURAL_TREE_LEAF_MASK_LIBRARY
    vec4 baseTexture = sampleProceduralTreeLeafMask(materialUv, varyings.proceduralLeafShape);
  #else
    vec4 baseTexture = sampleVegetationBaseTexture(materialUv);
  #endif
  #if defined(MATERIAL_HAS_BASETEXTURE) || defined(RENDERER_PROCEDURAL_TREE_LEAF_MASK_LIBRARY)
    applyVegetationAlphaCutoff(baseTexture.a * alphaCoverage);
  #endif
  #ifdef MATERIAL_VEGETATION_SHARED_GRASS_APPEARANCE
    // The imported texture remains the authored silhouette; colour and climate belong to the world surface.
    return terrainProjectEvaluateSharedGrassSurface(varyings);
  #endif
  #ifdef RENDERER_PROCEDURAL_TREE_LEAF_BILLBOARD
    // Procedural leaf textures are masks: color remains entirely material/instance driven.
    baseTexture.rgb = vec3(1.0);
  #endif
  vec3 baseTint = material_BaseColor.rgb;
  #ifdef MATERIAL_VEGETATION_CLIMATE_LEAF
    vec3 albedoColor = terrainProjectEvaluateLeafAlbedo(baseTexture.rgb, baseTint);
  #else
    vec3 albedoColor = baseTint * baseTexture.rgb;
  #endif
  #ifdef MATERIAL_ENABLE_SECOND_COLOR
    #ifdef MATERIAL_VEGETATION_CLIMATE_LEAF
      vec3 secondAlbedo = terrainProjectEvaluateLeafAlbedo(baseTexture.rgb, material_SecondColor.rgb);
    #else
      vec3 secondAlbedo = material_SecondColor.rgb * baseTexture.rgb;
    #endif
    albedoColor = terrainProjectVegetationSecondColor(
      varyings.positionWS,
      varyings.sourcePositionOS,
      varyings.uv,
      albedoColor,
      secondAlbedo,
      material_SecondColorWorldNoiseScale,
      material_SecondColorOffset,
      material_SecondColorFade,
      material_SecondColorLevel,
      material_SecondColorGradient
    );
  #endif
  #ifdef MATERIAL_VEGETATION_SHARED_GRASS_COLOR
    // Colour inheritance does not replace the plant's geometry normals, texture detail or material response.
    vec3 groundPaletteColor = mix(evaluateGrassBaseColor(varyings.positionWS.xz),
      evaluateGrassFarBaseColor(varyings.positionWS.xz), grassColorFieldVistaBlendWeight(varyings.positionWS));
    #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
      groundPaletteColor = mix(groundPaletteColor, varyings.assetAssemblyColor, terrainProjectPlantAuthoredChannels());
    #endif
    albedoColor *= groundPaletteColor;
  #elif defined(RENDERER_ASSET_ASSEMBLY_INSTANCE)
    #if defined(RENDERER_PROCEDURAL_TREE_GPU_VARIATION) && !defined(RENDERER_PROCEDURAL_TREE_GPU_BRANCH_VARIATION)
      // The measured white-birch leaf atlas is white RGB with an authored alpha silhouette.
      // Use its material layers only as texture detail; applying the governed albedo directly
      // avoids the hue-luminance division that previously amplified warm colors into clipping.
      float authoredLeafLuminance = dot(albedoColor, vec3(0.2126, 0.7152, 0.0722));
      albedoColor = authoredLeafLuminance * varyings.assetAssemblyColor;
    #else
      albedoColor *= varyings.assetAssemblyColor;
    #endif
  #endif

  float ambientOcclusion = 1.0;
  #if (defined(RENDERER_PROCEDURAL_TREE_GPU_LEAF_FRAME) || defined(RENDERER_PROCEDURAL_PLANT_CANOPY_OCCLUSION)) && defined(MATERIAL_PROCEDURAL_TREE_CANOPY_OCCLUSION)
    ambientOcclusion = exp(
      -max(varyings.proceduralTreeCanopyOpticalDepth, 0.0) *
        max(material_ProceduralTreeCanopyOcclusionDensity, 0.0)
    );
  #endif
  #ifdef MATERIAL_VEGETATION_CLIMATE_LEAF
    // Keep canopy visibility separate from albedo. Indirect lighting consumes it as AO;
    // shared lighting also uses it only while the real shadow-map signal fades away.
    ambientOcclusion = mix(
      1.0,
      ambientOcclusion,
      clamp(material_LeafBaseAOInfluence, 0.0, 1.0)
    );
  #endif

  float smoothness = material_Smoothness;
  #ifdef MATERIAL_HAS_SMOOTHNESS_TEXTURE
    smoothness *= texture2D(material_SmoothnessTexture, materialUv).g;
  #endif

  vec3 geometryNormal = normalize(varyings.normalWS);
  vec3 shadingNormal = geometryNormal;
  #ifdef MATERIAL_HAS_NORMALTEXTURE
    #ifdef NEED_VERTEX_TANGENT
      mat3 tangentToWorld = mat3(varyings.tangentWS, varyings.bitangentWS, geometryNormal);
    #else
      mat3 tangentToWorld = getTBNByDerivatives(
        materialUv,
        geometryNormal,
        varyings.positionWS,
        true
      );
    #endif
    vec3 tangentNormal = texture2D(material_NormalTexture, materialUv).xyz * 2.0 - 1.0;
    tangentNormal.xy *= material_NormalScale;
    tangentNormal.z = mix(1.0, tangentNormal.z, clamp(material_NormalScale, 0.0, 1.0));
    shadingNormal = normalize(tangentToWorld * tangentNormal);
  #endif
  #ifdef MATERIAL_VEGETATION_CLIMATE_LEAF
    if (!isFrontFacing && material_LeafFlipBackfaceNormals >= 0.5) {
      geometryNormal = -geometryNormal;
      shadingNormal = -shadingNormal;
    }
  #endif

  surfaceData.albedoColor = albedoColor;
  surfaceData.emissiveColor = vec3(0.0);
  surfaceData.metallic = 0.0;
  surfaceData.roughness = 1.0 - clamp(smoothness, 0.0, 1.0);
  surfaceData.ambientOcclusion = ambientOcclusion;
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
  #ifdef RENDERER_PROCEDURAL_TREE_LEAF_BILLBOARD
    // The billboard controls coverage only. A two-sided thin leaf reflects with the
    // procedural botanical normal oriented into the viewer's hemisphere.
    #ifndef MATERIAL_VEGETATION_CLIMATE_LEAF
      if (dot(surfaceData.normal, surfaceData.viewDir) < 0.0) {
        surfaceData.normal = -surfaceData.normal;
      }
    #endif
  #endif
  surfaceData.dotNV = clamp(dot(surfaceData.normal, surfaceData.viewDir), 0.0, 1.0);
  surfaceData.specularIntensity = 1.0;
  surfaceData.specularColor = vec3(1.0);
  terrainProjectApplyVegetationWetness(surfaceData, geometryNormal);
  // Shared field colours already include the global grass season; do not apply the leaf season a second time.
  #ifndef MATERIAL_VEGETATION_SHARED_GRASS_COLOR
  #if defined(MATERIAL_VEGETATION_CLIMATE_GRASS)
    surfaceData.albedoColor = terrainProjectApplyAuthoredSeasonColor(
      surfaceData.albedoColor,
      TERRAIN_PROJECT_SEASON_SPECIES_GRASS, terrainProjectPlantAuthoredChannels()
    );
  #elif defined(MATERIAL_VEGETATION_CLIMATE_LEAF) || defined(MATERIAL_VEGETATION_CLIMATE_SHRUB)
    surfaceData.albedoColor = terrainProjectApplyAuthoredSeasonColor(
      surfaceData.albedoColor,
      TERRAIN_PROJECT_SEASON_SPECIES_TREE_LEAF, terrainProjectPlantAuthoredChannels()
    );
  #elif defined(MATERIAL_VEGETATION_CLIMATE_BRANCH)
    surfaceData.albedoColor = terrainProjectApplyAuthoredSeasonColor(
      surfaceData.albedoColor,
      TERRAIN_PROJECT_SEASON_SPECIES_TREE_BARK, terrainProjectPlantAuthoredChannels()
    );
  #endif
  #endif
  #if defined(MATERIAL_VEGETATION_CLIMATE_GRASS) || defined(MATERIAL_VEGETATION_CLIMATE_FLOWER)
    terrainProjectApplyVegetationGrassClimate(surfaceData, geometryNormal);
  #elif defined(MATERIAL_VEGETATION_CLIMATE_LEAF)
    terrainProjectApplyVegetationLeafClimate(surfaceData, geometryNormal, varyings.sourcePositionOS.y);
  #elif defined(MATERIAL_VEGETATION_CLIMATE_SHRUB)
    terrainProjectApplyVegetationShrubClimate(surfaceData, geometryNormal);
  #elif defined(MATERIAL_VEGETATION_CLIMATE_BRANCH)
    terrainProjectApplyVegetationBranchClimate(surfaceData, geometryNormal);
  #endif
  return surfaceData;
}

#endif
