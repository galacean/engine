#ifndef TERRAIN_PROJECT_TERRAIN_CORE_DEBUG_INCLUDED
#define TERRAIN_PROJECT_TERRAIN_CORE_DEBUG_INCLUDED

#define TERRAIN_PROJECT_DEBUG_SOURCE_HEIGHT 7.0
#define TERRAIN_PROJECT_DEBUG_RENDERED_HEIGHT 8.0
#define TERRAIN_PROJECT_DEBUG_HEIGHT_SEAM_ERROR 9.0
#define TERRAIN_PROJECT_DEBUG_REGION_SEAM 10.0
#define TERRAIN_PROJECT_DEBUG_ALPHAMAP_LAYER_WEIGHTS 11.0
#define TERRAIN_PROJECT_DEBUG_HOLES 12.0
#define TERRAIN_PROJECT_DEBUG_CLIPMAP_LOD 13.0
#define TERRAIN_PROJECT_DEBUG_SAMPLING_MIP 14.0

vec2 material_DebugHeightRange;
float renderer_DebugWire;

float terrainProjectDebugNormalizedHeight(float height) {
  return clamp(
    (height - material_DebugHeightRange.x) /
      max(material_DebugHeightRange.y - material_DebugHeightRange.x, 0.0001),
    0.0,
    1.0
  );
}

vec3 terrainProjectDebugRegionColor(int regionIndex, vec2 worldXZ) {
  if (regionIndex < 0) return vec3(0.0);
  vec3 regionColor = fract(float(regionIndex + 1) * vec3(0.61803398875, 0.38196601125, 0.75487766625));
  vec4 bounds = material_TerrainRegionWorldBounds[regionIndex];
  vec2 local = clamp((worldXZ - bounds.xy) / bounds.zw, vec2(0.0), vec2(1.0));
  vec2 edgeDistance = min(local, vec2(1.0) - local);
  float seam = 1.0 - step(max(fwidth(local.x), fwidth(local.y)) * 1.5, min(edgeDistance.x, edgeDistance.y));
  return mix(regionColor, vec3(1.0), seam);
}

vec3 terrainProjectDebugStableColor(float index) {
  return fract((index + 1.0) * vec3(0.61803398875, 0.38196601125, 0.75487766625));
}

vec3 terrainProjectDebugLayerWeights(vec2 worldXZ) {
  #ifdef MATERIAL_TERRAIN_LAYERS
    int regionIndex;
    int alphamapOffset;
    int alphamapCount;
    if (terrainProjectResolveLayerGroups(worldXZ, regionIndex, alphamapOffset, alphamapCount)) {
      vec3 weightedColor = vec3(0.0);
      for (int groupIndex = 0; groupIndex < TERRAIN_PROJECT_MAX_ALPHAMAPS_PER_REGION; groupIndex++) {
        if (groupIndex >= alphamapCount) break;
        int alphamapIndex = alphamapOffset + groupIndex;
        vec4 weights = terrainProjectSampleAlphamap(alphamapIndex, worldXZ, regionIndex);
        vec4 layerIndices = texelFetch(material_TerrainAlphamapMetadata, ivec2(1, alphamapIndex), 0);
        for (int channel = 0; channel < 4; channel++) {
          int layerIndex = int(floor(layerIndices[channel] + 0.5));
          if (layerIndex >= 0 && layerIndex < material_TerrainLayerCount) {
            weightedColor += terrainProjectDebugStableColor(float(layerIndex)) * weights[channel];
          }
        }
      }
      return clamp(weightedColor, vec3(0.0), vec3(1.0));
    }
  #endif
  return vec3(0.0);
}

int terrainProjectDebugDominantLayer(vec2 worldXZ) {
  #ifdef MATERIAL_TERRAIN_LAYERS
    int regionIndex;
    int alphamapOffset;
    int alphamapCount;
    if (terrainProjectResolveLayerGroups(worldXZ, regionIndex, alphamapOffset, alphamapCount)) {
      int dominantLayer = -1;
      float dominantWeight = -1.0;
      for (int groupIndex = 0; groupIndex < TERRAIN_PROJECT_MAX_ALPHAMAPS_PER_REGION; groupIndex++) {
        if (groupIndex >= alphamapCount) break;
        int alphamapIndex = alphamapOffset + groupIndex;
        vec4 weights = terrainProjectSampleAlphamap(alphamapIndex, worldXZ, regionIndex);
        vec4 layerIndices = texelFetch(material_TerrainAlphamapMetadata, ivec2(1, alphamapIndex), 0);
        for (int channel = 0; channel < 4; channel++) {
          int layerIndex = int(floor(layerIndices[channel] + 0.5));
          if (
            layerIndex >= 0 &&
            layerIndex < material_TerrainLayerCount &&
            weights[channel] > dominantWeight
          ) {
            dominantLayer = layerIndex;
            dominantWeight = weights[channel];
          }
        }
      }
      return dominantLayer;
    }
  #endif
  return -1;
}

vec3 terrainProjectDebugClipmapLod(Varyings varyings) {
  if (varyings.terrainValid < 0.999) return vec3(1.0, 0.0, 1.0);
  vec3 lodColor = terrainProjectDebugStableColor(renderer_Lod);
  vec3 morphColor = mix(lodColor * 0.45, lodColor, clamp(varyings.clipmapMorph, 0.0, 1.0));
  return mix(morphColor, vec3(1.0), clamp(renderer_DebugWire, 0.0, 1.0));
}

vec3 terrainProjectDebugSamplingMip(vec2 worldXZ) {
  #ifdef MATERIAL_TERRAIN_LAYERS
    int layerIndex = terrainProjectDebugDominantLayer(worldXZ);
    if (layerIndex >= 0) {
      vec4 tiling = terrainProjectLayerMetadataAt(layerIndex, 0);
      vec2 uv = (worldXZ + tiling.zw) / tiling.xy;
      vec2 textureSizeAtMipZero = vec2(textureSize(material_TerrainLayerDiffuseTextures, 0).xy);
      vec2 footprintX = dFdx(uv * textureSizeAtMipZero);
      vec2 footprintY = dFdy(uv * textureSizeAtMipZero);
      float footprintSquared = max(dot(footprintX, footprintX), dot(footprintY, footprintY));
      float mip = max(0.0, 0.5 * log2(max(footprintSquared, 1e-8)));
      vec3 mipColor = terrainProjectDebugStableColor(floor(mip));
      return mix(mipColor * 0.45, mipColor, fract(mip));
    }
  #endif
  return vec3(0.0);
}

vec3 terrainProjectTerrainCoreDebugColor(Varyings varyings) {
  float sourceValid;
  float sourceHeight = terrainProjectHeightAt(varyings.sourceXZ, sourceValid);
  if (material_DebugView < TERRAIN_PROJECT_DEBUG_RENDERED_HEIGHT - 0.5) {
    return vec3(terrainProjectDebugNormalizedHeight(sourceHeight));
  }
  if (material_DebugView < TERRAIN_PROJECT_DEBUG_HEIGHT_SEAM_ERROR - 0.5) {
    return vec3(terrainProjectDebugNormalizedHeight(varyings.positionWS.y));
  }
  if (material_DebugView < TERRAIN_PROJECT_DEBUG_REGION_SEAM - 0.5) {
    float heightSpan = max(material_DebugHeightRange.y - material_DebugHeightRange.x, 0.0001);
    return vec3(clamp(abs(sourceHeight - varyings.positionWS.y) / heightSpan, 0.0, 1.0));
  }
  if (material_DebugView < TERRAIN_PROJECT_DEBUG_ALPHAMAP_LAYER_WEIGHTS - 0.5) {
    return terrainProjectDebugRegionColor(terrainProjectRegionIndex(varyings.positionWS.xz), varyings.positionWS.xz);
  }
  if (material_DebugView < TERRAIN_PROJECT_DEBUG_HOLES - 0.5) {
    return terrainProjectDebugLayerWeights(varyings.positionWS.xz);
  }
  if (material_DebugView < TERRAIN_PROJECT_DEBUG_CLIPMAP_LOD - 0.5) {
    return vec3(terrainProjectSolidAt(varyings.positionWS.xz));
  }
  if (material_DebugView < TERRAIN_PROJECT_DEBUG_SAMPLING_MIP - 0.5) {
    return terrainProjectDebugClipmapLod(varyings);
  }
  return terrainProjectDebugSamplingMip(varyings.positionWS.xz);
}

#endif
