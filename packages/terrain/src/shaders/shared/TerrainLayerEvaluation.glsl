#ifndef TERRAIN_PROJECT_LAYER_EVALUATION_INCLUDED
#define TERRAIN_PROJECT_LAYER_EVALUATION_INCLUDED
#include "shared/TerrainRegions.glsl"
  #ifdef TERRAIN_GROUND_RENDERER
  vec4 renderer_TerrainFirstAlphamapRect;
  #define GROUND_TerrainFirstAlphamapRect renderer_TerrainFirstAlphamapRect
  #else
  vec4 material_TerrainFirstAlphamapRect;
  #define GROUND_TerrainFirstAlphamapRect material_TerrainFirstAlphamapRect
  #endif
  #if defined(MATERIAL_TERRAIN_UNTEXTURED_SINGLE_MAP) || defined(MATERIAL_TERRAIN_SINGLE_DIFFUSE_SINGLE_MAP)
    #ifdef TERRAIN_GROUND_RENDERER
    vec4 renderer_TerrainSimpleColors[4];
    #define GROUND_TerrainSimpleColors renderer_TerrainSimpleColors
    #else
    vec4 material_TerrainSimpleColors[4];
    #define GROUND_TerrainSimpleColors material_TerrainSimpleColors
    #endif
    #ifdef TERRAIN_GROUND_RENDERER
    vec4 renderer_TerrainSimpleSurfaces[4];
    #define GROUND_TerrainSimpleSurfaces renderer_TerrainSimpleSurfaces
    #else
    vec4 material_TerrainSimpleSurfaces[4];
    #define GROUND_TerrainSimpleSurfaces material_TerrainSimpleSurfaces
    #endif
    #ifdef TERRAIN_GROUND_RENDERER
    vec4 renderer_TerrainFirstLayerIndices;
    #define GROUND_TerrainFirstLayerIndices renderer_TerrainFirstLayerIndices
    #else
    vec4 material_TerrainFirstLayerIndices;
    #define GROUND_TerrainFirstLayerIndices material_TerrainFirstLayerIndices
    #endif
  #endif
  #ifdef MATERIAL_TERRAIN_LAYER_SINGLE_DIFFUSE
    #ifdef TERRAIN_GROUND_RENDERER
    sampler2D renderer_TerrainLayerSingleDiffuse;
    vec4 renderer_TerrainSimpleTextureChannels;
    vec4 renderer_TerrainSimpleTextureTransform;
    vec4 renderer_TerrainSimpleTextureMin;
    vec4 renderer_TerrainSimpleTextureMax;
    #define GROUND_TerrainLayerSingleDiffuse renderer_TerrainLayerSingleDiffuse
    #define GROUND_TerrainSimpleTextureChannels renderer_TerrainSimpleTextureChannels
    #define GROUND_TerrainSimpleTextureTransform renderer_TerrainSimpleTextureTransform
    #define GROUND_TerrainSimpleTextureMin renderer_TerrainSimpleTextureMin
    #define GROUND_TerrainSimpleTextureMax renderer_TerrainSimpleTextureMax
    #else
    sampler2D material_TerrainLayerSingleDiffuse;
    vec4 material_TerrainSimpleTextureChannels;
    vec4 material_TerrainSimpleTextureTransform;
    vec4 material_TerrainSimpleTextureMin;
    vec4 material_TerrainSimpleTextureMax;
    #define GROUND_TerrainLayerSingleDiffuse material_TerrainLayerSingleDiffuse
    #define GROUND_TerrainSimpleTextureChannels material_TerrainSimpleTextureChannels
    #define GROUND_TerrainSimpleTextureTransform material_TerrainSimpleTextureTransform
    #define GROUND_TerrainSimpleTextureMin material_TerrainSimpleTextureMin
    #define GROUND_TerrainSimpleTextureMax material_TerrainSimpleTextureMax
    #endif
  #endif
  #define TERRAIN_PROJECT_MAX_ALPHAMAPS_PER_REGION 16

  #ifdef TERRAIN_GROUND_RENDERER
  sampler2D renderer_TerrainAlphamapAtlas;
  #define GROUND_TerrainAlphamapAtlas renderer_TerrainAlphamapAtlas
  #else
  sampler2D material_TerrainAlphamapAtlas;
  #define GROUND_TerrainAlphamapAtlas material_TerrainAlphamapAtlas
  #endif
  #ifdef TERRAIN_GROUND_RENDERER
  vec2 renderer_TerrainAlphamapAtlasInvSize;
  #define GROUND_TerrainAlphamapAtlasInvSize renderer_TerrainAlphamapAtlasInvSize
  #else
  vec2 material_TerrainAlphamapAtlasInvSize;
  #define GROUND_TerrainAlphamapAtlasInvSize material_TerrainAlphamapAtlasInvSize
  #endif
  #ifdef TERRAIN_GROUND_RENDERER
  highp sampler2D renderer_TerrainAlphamapMetadata;
  #define GROUND_TerrainAlphamapMetadata renderer_TerrainAlphamapMetadata
  #else
  highp sampler2D material_TerrainAlphamapMetadata;
  #define GROUND_TerrainAlphamapMetadata material_TerrainAlphamapMetadata
  #endif
    #ifdef TERRAIN_GROUND_RENDERER
    highp sampler2D renderer_TerrainLayerMetadata;
    #define GROUND_TerrainLayerMetadata renderer_TerrainLayerMetadata
    #else
    highp sampler2D material_TerrainLayerMetadata;
    #define GROUND_TerrainLayerMetadata material_TerrainLayerMetadata
    #endif
    #if defined(MATERIAL_TERRAIN_LAYER_DIFFUSE_TEXTURES) && !defined(MATERIAL_TERRAIN_LAYER_SINGLE_DIFFUSE)
      #ifdef TERRAIN_GROUND_RENDERER
      highp sampler2DArray renderer_TerrainLayerDiffuseTextures;
      #define GROUND_TerrainLayerDiffuseTextures renderer_TerrainLayerDiffuseTextures
      #else
      highp sampler2DArray material_TerrainLayerDiffuseTextures;
      #define GROUND_TerrainLayerDiffuseTextures material_TerrainLayerDiffuseTextures
      #endif
    #endif
    #ifdef MATERIAL_TERRAIN_LAYER_NORMAL_TEXTURES
      #ifdef TERRAIN_GROUND_RENDERER
      highp sampler2DArray renderer_TerrainLayerNormalTextures;
      #define GROUND_TerrainLayerNormalTextures renderer_TerrainLayerNormalTextures
      #else
      highp sampler2DArray material_TerrainLayerNormalTextures;
      #define GROUND_TerrainLayerNormalTextures material_TerrainLayerNormalTextures
      #endif
    #endif
    #ifdef MATERIAL_TERRAIN_LAYER_MASK_TEXTURES
      #ifdef TERRAIN_GROUND_RENDERER
      highp sampler2DArray renderer_TerrainLayerMaskTextures;
      #define GROUND_TerrainLayerMaskTextures renderer_TerrainLayerMaskTextures
      #else
      highp sampler2DArray material_TerrainLayerMaskTextures;
      #define GROUND_TerrainLayerMaskTextures material_TerrainLayerMaskTextures
      #endif
    #endif
    #ifdef TERRAIN_GROUND_RENDERER
    vec2 renderer_TerrainRegionAlphamapRanges[TERRAIN_PROJECT_MAX_ACTIVE_REGIONS];
    #define GROUND_TerrainRegionAlphamapRanges renderer_TerrainRegionAlphamapRanges
    #else
    vec2 material_TerrainRegionAlphamapRanges[TERRAIN_PROJECT_MAX_ACTIVE_REGIONS];
    #define GROUND_TerrainRegionAlphamapRanges material_TerrainRegionAlphamapRanges
    #endif
    #ifdef TERRAIN_GROUND_RENDERER
    int renderer_TerrainAlphamapCount;
    #define GROUND_TerrainAlphamapCount renderer_TerrainAlphamapCount
    #else
    int material_TerrainAlphamapCount;
    #define GROUND_TerrainAlphamapCount material_TerrainAlphamapCount
    #endif
    #ifdef TERRAIN_GROUND_RENDERER
    int renderer_TerrainLayerCount;
    #define GROUND_TerrainLayerCount renderer_TerrainLayerCount
    #else
    int material_TerrainLayerCount;
    #define GROUND_TerrainLayerCount material_TerrainLayerCount
    #endif
  #ifdef TERRAIN_GROUND_RENDERER
  sampler2D renderer_TerrainMacroVariationTexture;
  #define GROUND_TerrainMacroVariationTexture renderer_TerrainMacroVariationTexture
  #else
  sampler2D material_TerrainMacroVariationTexture;
  #define GROUND_TerrainMacroVariationTexture material_TerrainMacroVariationTexture
  #endif
  #ifdef TERRAIN_GROUND_RENDERER
  int renderer_TerrainMacroVariationEnabled;
  #define GROUND_TerrainMacroVariationEnabled renderer_TerrainMacroVariationEnabled
  #else
  int material_TerrainMacroVariationEnabled;
  #define GROUND_TerrainMacroVariationEnabled material_TerrainMacroVariationEnabled
  #endif
  #ifdef TERRAIN_GROUND_RENDERER
  vec3 renderer_TerrainMacroColorA;
  #define GROUND_TerrainMacroColorA renderer_TerrainMacroColorA
  #else
  vec3 material_TerrainMacroColorA;
  #define GROUND_TerrainMacroColorA material_TerrainMacroColorA
  #endif
  #ifdef TERRAIN_GROUND_RENDERER
  vec3 renderer_TerrainMacroColorB;
  #define GROUND_TerrainMacroColorB renderer_TerrainMacroColorB
  #else
  vec3 material_TerrainMacroColorB;
  #define GROUND_TerrainMacroColorB material_TerrainMacroColorB
  #endif
  #ifdef TERRAIN_GROUND_RENDERER
  float renderer_TerrainMacroScaleA;
  #define GROUND_TerrainMacroScaleA renderer_TerrainMacroScaleA
  #else
  float material_TerrainMacroScaleA;
  #define GROUND_TerrainMacroScaleA material_TerrainMacroScaleA
  #endif
  #ifdef TERRAIN_GROUND_RENDERER
  float renderer_TerrainMacroScaleB;
  #define GROUND_TerrainMacroScaleB renderer_TerrainMacroScaleB
  #else
  float material_TerrainMacroScaleB;
  #define GROUND_TerrainMacroScaleB material_TerrainMacroScaleB
  #endif
  #ifdef TERRAIN_GROUND_RENDERER
  float renderer_TerrainMacroAngle;
  #define GROUND_TerrainMacroAngle renderer_TerrainMacroAngle
  #else
  float material_TerrainMacroAngle;
  #define GROUND_TerrainMacroAngle material_TerrainMacroAngle
  #endif
  #ifdef TERRAIN_GROUND_RENDERER
  vec2 renderer_TerrainMacroOffset;
  #define GROUND_TerrainMacroOffset renderer_TerrainMacroOffset
  #else
  vec2 material_TerrainMacroOffset;
  #define GROUND_TerrainMacroOffset material_TerrainMacroOffset
  #endif
    #ifdef TERRAIN_GROUND_RENDERER
    int renderer_TerrainDetilingLayerMask;
    #define GROUND_TerrainDetilingLayerMask renderer_TerrainDetilingLayerMask
    #else
    int material_TerrainDetilingLayerMask;
    #define GROUND_TerrainDetilingLayerMask material_TerrainDetilingLayerMask
    #endif
  #ifdef MATERIAL_TERRAIN_SEED_FAR_TRANSITION
    #ifdef TERRAIN_GROUND_RENDERER
    float renderer_TerrainFarCompositeLod;
    #define GROUND_TerrainFarCompositeLod renderer_TerrainFarCompositeLod
    #else
    float material_TerrainFarCompositeLod;
    #define GROUND_TerrainFarCompositeLod material_TerrainFarCompositeLod
    #endif
  #endif
  #ifdef MATERIAL_TERRAIN_GRASS_SHADING
    #ifdef TERRAIN_GROUND_RENDERER
    vec4 renderer_TerrainRoadColor;
    #define GROUND_TerrainRoadColor renderer_TerrainRoadColor
    #else
    vec4 material_TerrainRoadColor;
    #define GROUND_TerrainRoadColor material_TerrainRoadColor
    #endif
    #include "shared/GrassColorField.glsl"
  #endif

  struct TerrainProjectLayerBlend {
    vec3 albedo;
    vec3 tangentNormal;
    float metallic;
    float smoothness;
    float ambientOcclusion;
    float snowResponse;
    float grassWeight;
    float roadWeight;
    float weight;
  };

  vec4 terrainProjectLayerMetadataAt(int layerIndex, int column) {
    return texelFetch(GROUND_TerrainLayerMetadata, ivec2(column, layerIndex), 0);
  }

  vec4 terrainProjectSampleAlphamap(int alphamapIndex, vec2 worldXZ, int regionIndex) {
    #ifdef MATERIAL_TERRAIN_SINGLE_ALPHAMAP
    vec4 rect = GROUND_TerrainFirstAlphamapRect;
    #else
    vec4 rect = texelFetch(GROUND_TerrainAlphamapMetadata, ivec2(0, alphamapIndex), 0);
    #endif
    vec4 bounds = GROUND_TerrainRegionWorldBounds[regionIndex];
    vec2 local = clamp((worldXZ - bounds.xy) / bounds.zw, vec2(0.0), vec2(1.0));
    vec2 grid = local * (rect.zw - vec2(1.0));
    #ifdef MATERIAL_TERRAIN_SINGLE_ALPHAMAP
      return texture2D(
        GROUND_TerrainAlphamapAtlas,
        (rect.xy + grid + vec2(0.5)) * GROUND_TerrainAlphamapAtlasInvSize
      );
    #else
    vec2 minimum = floor(grid);
    vec2 maximum = min(minimum + vec2(1.0), rect.zw - vec2(1.0));
    vec2 blend = grid - minimum;
    ivec2 atlasMinimum = ivec2(rect.xy + minimum);
    ivec2 atlasMaximum = ivec2(rect.xy + maximum);
    vec4 weights00 = texelFetch(GROUND_TerrainAlphamapAtlas, atlasMinimum, 0);
    vec4 weights10 = texelFetch(GROUND_TerrainAlphamapAtlas, ivec2(atlasMaximum.x, atlasMinimum.y), 0);
    vec4 weights01 = texelFetch(GROUND_TerrainAlphamapAtlas, ivec2(atlasMinimum.x, atlasMaximum.y), 0);
    vec4 weights11 = texelFetch(GROUND_TerrainAlphamapAtlas, atlasMaximum, 0);
    return mix(mix(weights00, weights10, blend.x), mix(weights01, weights11, blend.x), blend.y);
    #endif
  }

  vec3 terrainProjectLayerNormalTangent(vec3 sampledNormal, float normalScale) {
    // Grasslands normal textures are exported as linear RGB normals. Preserve the authored Z
    // component and apply Normal Scale to XY before the blended result is normalized, matching
    // Unity Terrain's UnpackNormalRGB path. Reconstructing Z after scaling can force isolated
    // texels onto the tangent plane when authored scales exceed one.
    vec3 tangentNormal = sampledNormal * 2.0 - 1.0;
    tangentNormal.xy *= normalScale;
    return tangentNormal;
  }

  vec3 terrainProjectLayerNormalToWorld(vec3 tangentNormal, vec3 geometryNormal) {
    vec3 tangent = vec3(1.0, 0.0, 0.0) - geometryNormal * geometryNormal.x;
    if (dot(tangent, tangent) < 1e-5) tangent = vec3(0.0, 0.0, 1.0) - geometryNormal * geometryNormal.z;
    tangent = normalize(tangent);
    vec3 bitangent = normalize(cross(tangent, geometryNormal));
    return normalize(
      tangent * tangentNormal.x + bitangent * tangentNormal.y + geometryNormal * tangentNormal.z
    );
  }

  vec2 terrainProjectRotateUv(vec2 value, vec2 cosineSine) {
    return vec2(
      cosineSine.x * value.x + cosineSine.y * value.y,
      cosineSine.x * value.y - cosineSine.y * value.x
    );
  }

  float terrainProjectRandomCell(vec2 cell) {
    vec3 value = fract(vec3(cell.xyx) * 0.1031);
    value += dot(value, value.yzx + 33.33);
    return fract((value.x + value.y) * value.z);
  }

  bool terrainProjectLayerUsesDetiling(int layerIndex) {
    if (layerIndex < 0 || layerIndex >= 31) return false;
    return (GROUND_TerrainDetilingLayerMask & (1 << layerIndex)) != 0;
  }

  void terrainProjectPrepareLayerUv(
    int layerIndex,
    vec2 baseUv,
    out vec2 sampleUv,
    out vec2 sampleDdx,
    out vec2 sampleDdy,
    out vec2 tangentCosineSine
  ) {
    sampleUv = baseUv;
    sampleDdx = dFdx(baseUv);
    sampleDdy = dFdy(baseUv);
    tangentCosineSine = vec2(1.0, 0.0);
    if (terrainProjectLayerUsesDetiling(layerIndex)) {
      vec2 cell = floor(baseUv + vec2(0.5));
      float angle = (terrainProjectRandomCell(cell) * 2.0 - 1.0) * 3.141592653589793;
      vec2 cosineSine = vec2(cos(angle), sin(angle));
      sampleUv = terrainProjectRotateUv(baseUv - cell, cosineSine) + cell;
      sampleDdx = terrainProjectRotateUv(sampleDdx, cosineSine);
      sampleDdy = terrainProjectRotateUv(sampleDdy, cosineSine);
      tangentCosineSine = vec2(cosineSine.x, -cosineSine.y);
    }
  }

  vec3 terrainProjectMacroVariationFromNoise(float noiseA, float noiseB) {
    vec3 variation = mix(GROUND_TerrainMacroColorA, vec3(1.0), noiseA);
    return variation * mix(GROUND_TerrainMacroColorB, vec3(1.0), noiseB);
  }

  vec3 terrainProjectMacroVariation(vec2 worldXZ) {
    if (GROUND_TerrainMacroVariationEnabled == 0) return vec3(1.0);
    vec2 cosineSine = vec2(cos(GROUND_TerrainMacroAngle), sin(GROUND_TerrainMacroAngle));
    float noiseA = texture(
      GROUND_TerrainMacroVariationTexture,
      terrainProjectRotateUv(worldXZ * GROUND_TerrainMacroScaleA + GROUND_TerrainMacroOffset, cosineSine)
    ).r;
    float noiseB = texture(GROUND_TerrainMacroVariationTexture, worldXZ * GROUND_TerrainMacroScaleB).r;
    return terrainProjectMacroVariationFromNoise(noiseA, noiseB);
  }

  void terrainProjectAccumulateLayer(
    inout TerrainProjectLayerBlend blend,
    int layerIndex,
    float weight,
    vec3 positionWS
  ) {
    if (weight > 0.0 && layerIndex >= 0 && layerIndex < GROUND_TerrainLayerCount) {
      vec4 diffuseRemapMin = terrainProjectLayerMetadataAt(layerIndex, 1);
      vec4 materialScalars = terrainProjectLayerMetadataAt(layerIndex, 5);
      vec4 layerStorage = terrainProjectLayerMetadataAt(layerIndex, 7);
      float snowResponse = layerStorage.x;
      float appearanceRole = materialScalars.w;

      #if defined(MATERIAL_TERRAIN_LAYER_DIFFUSE_TEXTURES) || \
        defined(MATERIAL_TERRAIN_LAYER_NORMAL_TEXTURES) || defined(MATERIAL_TERRAIN_LAYER_MASK_TEXTURES)
      vec4 tiling = terrainProjectLayerMetadataAt(layerIndex, 0);
      vec2 baseUv = (positionWS.xz + tiling.zw) / tiling.xy;
      vec2 sampleUv;
      vec2 sampleDdx;
      vec2 sampleDdy;
      vec2 tangentCosineSine;
      terrainProjectPrepareLayerUv(
        layerIndex,
        baseUv,
        sampleUv,
        sampleDdx,
        sampleDdy,
        tangentCosineSine
      );
      #endif

      #ifdef MATERIAL_TERRAIN_LAYER_DIFFUSE_TEXTURES
      vec4 diffuse = diffuseRemapMin;
      if (layerStorage.y >= 0.0) {
      #ifdef MATERIAL_TERRAIN_LAYER_SINGLE_DIFFUSE
      vec4 diffuseSample = textureGrad(GROUND_TerrainLayerSingleDiffuse, sampleUv, sampleDdx, sampleDdy);
      #else
      vec4 diffuseSample = textureGrad(
        GROUND_TerrainLayerDiffuseTextures,
        vec3(sampleUv, layerStorage.y),
        sampleDdx,
        sampleDdy
      );
      #endif
      vec4 diffuseRemapMax = terrainProjectLayerMetadataAt(layerIndex, 2);
      diffuse = mix(diffuseRemapMin, diffuseRemapMax, diffuseSample);
      }
      #else
      vec4 diffuse = diffuseRemapMin;
      #endif

      #ifdef MATERIAL_TERRAIN_LAYER_NORMAL_TEXTURES
      vec3 tangentNormal = vec3(0.0, 0.0, 1.0);
      if (layerStorage.z >= 0.0) {
      vec3 normalSample = textureGrad(
        GROUND_TerrainLayerNormalTextures,
        vec3(sampleUv, layerStorage.z),
        sampleDdx,
        sampleDdy
      ).xyz;
      tangentNormal = terrainProjectLayerNormalTangent(normalSample, materialScalars.x);
      tangentNormal.xy = terrainProjectRotateUv(tangentNormal.xy, tangentCosineSine);
      }
      #else
      vec3 tangentNormal = vec3(0.0, 0.0, 1.0);
      #endif

      #ifdef MATERIAL_TERRAIN_LAYER_MASK_TEXTURES
      vec4 mask = vec4(0.0, 1.0, 0.0, 0.0);
      if (layerStorage.w >= 0.0) {
      vec4 maskSample = textureGrad(
        GROUND_TerrainLayerMaskTextures,
        vec3(sampleUv, layerStorage.w),
        sampleDdx,
        sampleDdy
      );
      vec4 maskRemapMin = terrainProjectLayerMetadataAt(layerIndex, 3);
      vec4 maskRemapMax = terrainProjectLayerMetadataAt(layerIndex, 4);
      mask = mix(maskRemapMin, maskRemapMax, maskSample);
      }
      #endif

      #ifdef MATERIAL_TERRAIN_GRASS_SHADING
        if (appearanceRole == 1.0) {
          // Seed grass owns its colour through the shared world field. Keep the layer contribution
          // neutral so the same field can replace it exactly after Alphamap blending.
          diffuse.rgb = vec3(1.0);
        } else if (appearanceRole == 2.0) {
          // Recolour explicitly tagged layers while preserving their PBR and climate parameters.
          diffuse.rgb = GROUND_TerrainRoadColor.rgb;
        }
      #endif

      blend.albedo += diffuse.rgb * weight;
      blend.tangentNormal += tangentNormal * weight;
      #ifdef MATERIAL_TERRAIN_LAYER_MASK_TEXTURES
      float hasMask = layerStorage.w >= 0.0 ? 1.0 : 0.0;
      blend.metallic += mix(materialScalars.y, mask.r, hasMask) * weight;
      blend.smoothness += mix(materialScalars.z, mask.a, hasMask) * weight;
      blend.ambientOcclusion += mix(1.0, mask.g, hasMask) * weight;
      #else
      blend.metallic += materialScalars.y * weight;
      blend.smoothness += materialScalars.z * weight;
      blend.ambientOcclusion += weight;
      #endif
      blend.snowResponse += snowResponse * weight;
      blend.grassWeight += (appearanceRole == 1.0 ? weight : 0.0);
      #ifdef MATERIAL_TERRAIN_GRASS_SHADING
        blend.roadWeight += (appearanceRole == 2.0 ? weight : 0.0);
      #endif
      blend.weight += weight;
    }
  }

  bool terrainProjectResolveLayerGroups(
    vec2 worldXZ,
    out int regionIndex,
    out int alphamapOffset,
    out int alphamapCount
  ) {
    regionIndex = terrainProjectRegionIndex(worldXZ);
    alphamapOffset = 0;
    alphamapCount = 0;
    if (regionIndex < 0) return false;
    vec2 range = GROUND_TerrainRegionAlphamapRanges[regionIndex];
    alphamapOffset = int(range.x + 0.5);
    alphamapCount = min(int(range.y + 0.5), TERRAIN_PROJECT_MAX_ALPHAMAPS_PER_REGION);
    return alphamapCount > 0;
  }

  #if defined(MATERIAL_TERRAIN_UNTEXTURED_SINGLE_MAP) || defined(MATERIAL_TERRAIN_SINGLE_DIFFUSE_SINGLE_MAP)
  TerrainProjectLayerBlend terrainProjectSimpleGroundSurface(vec3 positionWS, vec2 positionDx, vec2 positionDy) {
    TerrainProjectLayerBlend blend;
    blend.albedo = vec3(0.0);
    blend.tangentNormal = vec3(0.0);
    blend.metallic = 0.0;
    blend.smoothness = 0.0;
    blend.ambientOcclusion = 0.0;
    blend.snowResponse = 0.0;
    blend.grassWeight = 0.0;
    blend.roadWeight = 0.0;
    blend.weight = 0.0;
    int region;
    int alphamapOffset;
    int alphamapCount;
    if (!terrainProjectResolveLayerGroups(positionWS.xz, region, alphamapOffset, alphamapCount)) return blend;
    vec4 weights = terrainProjectSampleAlphamap(alphamapOffset, positionWS.xz, region);
    vec4 layerIndices = GROUND_TerrainFirstLayerIndices;
    #ifdef MATERIAL_TERRAIN_SINGLE_DIFFUSE_SINGLE_MAP
    vec4 sharedColor = vec4(0.0);
    if (dot(weights, GROUND_TerrainSimpleTextureChannels) > 0.0) {
      vec4 texel = textureGrad(GROUND_TerrainLayerSingleDiffuse,
        positionWS.xz * GROUND_TerrainSimpleTextureTransform.xy + GROUND_TerrainSimpleTextureTransform.zw,
        positionDx * GROUND_TerrainSimpleTextureTransform.xy, positionDy * GROUND_TerrainSimpleTextureTransform.xy);
      sharedColor = mix(GROUND_TerrainSimpleTextureMin, GROUND_TerrainSimpleTextureMax, texel);
    }
    #endif
    for (int channel = 0; channel < 4; channel++) {
      int layerIndex = int(floor(layerIndices[channel] + 0.5));
      if (layerIndex >= 0) {
        float weight = weights[channel];
        vec4 color = GROUND_TerrainSimpleColors[channel];
        vec4 surface = GROUND_TerrainSimpleSurfaces[channel];
        #ifdef MATERIAL_TERRAIN_SINGLE_DIFFUSE_SINGLE_MAP
        color = mix(color, sharedColor, GROUND_TerrainSimpleTextureChannels[channel]);
        #endif
        #ifdef MATERIAL_TERRAIN_GRASS_SHADING
          if (surface.w == 1.0) color.rgb = vec3(1.0);
          if (surface.w == 2.0) color.rgb = GROUND_TerrainRoadColor.rgb;
          blend.roadWeight += (surface.w == 2.0 ? weight : 0.0);
        #endif
        blend.grassWeight += (surface.w == 1.0 ? weight : 0.0);
        blend.albedo += color.rgb * weight;
        blend.tangentNormal.z += weight;
        blend.metallic += surface.x * weight;
        blend.smoothness += surface.y * weight;
        blend.snowResponse += surface.z * weight;
        blend.ambientOcclusion += weight;
        blend.weight += weight;
      }
    }
    if (blend.weight > 0.0) {
      float inverseWeight = 1.0 / blend.weight;
      blend.albedo *= inverseWeight;
      // Match Unity Terrain's zero-vector guard before normalizing a weighted layer blend.
      blend.tangentNormal.z += 1e-5;
      blend.tangentNormal = normalize(blend.tangentNormal * inverseWeight);
      blend.metallic *= inverseWeight;
      blend.smoothness *= inverseWeight;
      blend.ambientOcclusion *= inverseWeight;
      blend.snowResponse *= inverseWeight;
      blend.grassWeight *= inverseWeight;
      blend.roadWeight *= inverseWeight;
    }
    return blend;
  }
  #endif

  bool terrainProjectEvaluateLayerGroup(
    vec3 positionWS,
    int regionIndex,
    int alphamapIndex,
    out TerrainProjectLayerBlend blend
  ) {
    #if defined(MATERIAL_TERRAIN_UNTEXTURED_SINGLE_MAP) || defined(MATERIAL_TERRAIN_SINGLE_DIFFUSE_SINGLE_MAP)
    blend = terrainProjectSimpleGroundSurface(positionWS, dFdx(positionWS.xz), dFdy(positionWS.xz));
    return true;
    #else
    blend.albedo = vec3(0.0);
    blend.tangentNormal = vec3(0.0);
    blend.metallic = 0.0;
    blend.smoothness = 0.0;
    blend.ambientOcclusion = 0.0;
    blend.snowResponse = 0.0;
    blend.grassWeight = 0.0;
    blend.roadWeight = 0.0;
    blend.weight = 0.0;
    if (alphamapIndex < 0 || alphamapIndex >= GROUND_TerrainAlphamapCount) return false;
    vec4 weights = terrainProjectSampleAlphamap(alphamapIndex, positionWS.xz, regionIndex);
    vec4 layerIndices = texelFetch(GROUND_TerrainAlphamapMetadata, ivec2(1, alphamapIndex), 0);
    for (int channel = 0; channel < 4; channel++) {
      terrainProjectAccumulateLayer(blend, int(floor(layerIndices[channel] + 0.5)), weights[channel], positionWS);
    }
    if (blend.weight > 0.0) {
      float inverseWeight = 1.0 / blend.weight;
      blend.albedo *= inverseWeight;
      // Match Unity Terrain's zero-vector guard before normalizing a weighted layer blend.
      blend.tangentNormal.z += 1e-5;
      blend.tangentNormal = normalize(blend.tangentNormal * inverseWeight);
      blend.metallic *= inverseWeight;
      blend.smoothness *= inverseWeight;
      blend.ambientOcclusion *= inverseWeight;
      blend.snowResponse *= inverseWeight;
      blend.grassWeight *= inverseWeight;
      blend.roadWeight *= inverseWeight;
    }
    return true;
    #endif
  }

  #include "shared/GrassSurfaceField.glsl"
  // Both terrain and vegetation use this unlit palette evaluation.
  vec3 terrainProjectGroundColor(TerrainProjectLayerBlend blend, vec3 positionWS) {
    vec3 color = blend.albedo;
    #ifdef MATERIAL_TERRAIN_GRASS_SHADING
      float vista = grassColorFieldVistaBlendWeight(positionWS);
      float field = terrainProjectGrassSurfaceField(positionWS);
      color += (grassColorFromField(field) - vec3(1.0)) * clamp(blend.grassWeight, 0.0, 1.0);
      color += (roadDetailColorFromField(field, GROUND_TerrainRoadColor.rgb, vista) - GROUND_TerrainRoadColor.rgb)
        * clamp(blend.roadWeight, 0.0, 1.0);
    #else
      color *= terrainProjectMacroVariation(positionWS.xz);
    #endif
    return color;
  }

  TerrainProjectLayerBlend terrainProjectGroundSurface(vec3 positionWS) {
    TerrainProjectLayerBlend result;
    result.albedo = vec3(0.0); result.tangentNormal = vec3(0.0);
    result.metallic = 0.0; result.smoothness = 0.0; result.ambientOcclusion = 0.0;
    result.snowResponse = 0.0; result.grassWeight = 0.0; result.roadWeight = 0.0; result.weight = 0.0;
    int region, first, count;
    if (terrainProjectResolveLayerGroups(positionWS.xz, region, first, count)) {
      for (int i = 0; i < TERRAIN_PROJECT_MAX_ALPHAMAPS_PER_REGION; i++) {
        if (i >= count) break;
        TerrainProjectLayerBlend part;
        if (terrainProjectEvaluateLayerGroup(positionWS, region, first + i, part)) {
          result.albedo += part.albedo * part.weight;
          result.tangentNormal += part.tangentNormal * part.weight;
          result.metallic += part.metallic * part.weight;
          result.smoothness += part.smoothness * part.weight;
          result.ambientOcclusion += part.ambientOcclusion * part.weight;
          result.snowResponse += part.snowResponse * part.weight;
          result.grassWeight += part.grassWeight * part.weight;
          result.roadWeight += part.roadWeight * part.weight;
          result.weight += part.weight;
        }
      }
    }
    float inverse = 1.0 / max(result.weight, 0.00001);
    result.albedo *= inverse; result.metallic *= inverse; result.smoothness *= inverse;
    result.ambientOcclusion *= inverse; result.snowResponse *= inverse;
    result.grassWeight *= inverse; result.roadWeight *= inverse;
    result.tangentNormal = normalize(result.tangentNormal + vec3(0.0, 0.0, 0.00001));
    return result;
  }

#endif
