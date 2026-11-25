#ifndef TERRAIN_PROJECT_HEIGHT_INCLUDED
#define TERRAIN_PROJECT_HEIGHT_INCLUDED
#define TERRAIN_PROJECT_CLIPMAP_GEOMETRY

#include "terrain/TerrainHeightField.glsl"

float material_TerrainVertexSpacing;
vec2 material_TerrainGridOrigin;
float renderer_Lod;
float renderer_ClipmapMeshSize;

struct TerrainProjectClipmapVertex {
  vec3 positionWS;
  vec2 sourceXZ;
  float valid;
  float morph;
};

float terrainProjectClipmapMorphFactor(vec2 sourceXZ) {
  float levelSpacing = material_TerrainVertexSpacing * exp2(renderer_Lod);
  vec2 distanceInLevelVertices = abs(sourceXZ - camera_Position.xz) / levelSpacing;
  float outerDistance = max(distanceInLevelVertices.x, distanceInLevelVertices.y);
  float transition = (outerDistance - renderer_ClipmapMeshSize - 4.0) / (renderer_ClipmapMeshSize - 4.0);
  return smoothstep(0.0, 1.0, transition);
}

vec2 terrainProjectClipmapVertexShift(vec3 positionOS, vec2 sourceXZ) {
  float levelSpacing = material_TerrainVertexSpacing * exp2(renderer_Lod);
  vec2 levelGrid = (sourceXZ - material_TerrainGridOrigin) / levelSpacing;
  vec2 vertexParity = fract(positionOS.xz * 0.5) * 2.0;
  if (renderer_Lod < 0.5) {
    float diagonalParity = round(
      fract(round(mod(levelGrid.y, 4.0)) * round(mod(levelGrid.x, 4.0)) * 0.25)
    );
    return mix(vertexParity, vec2(vertexParity.x, -vertexParity.y), diagonalParity);
  }
  return vertexParity * round((fract(levelGrid * 0.25) - 0.5) * 4.0);
}

TerrainProjectClipmapVertex terrainProjectClipmapVertexAt(vec3 positionOS) {
  TerrainProjectClipmapVertex result;
  vec4 homogeneousPositionWS = renderer_ModelMat * vec4(positionOS, 1.0);
  vec3 sourcePositionWS = homogeneousPositionWS.xyz / homogeneousPositionWS.w;
  result.sourceXZ = sourcePositionWS.xz;
  #ifdef MATERIAL_TERRAIN_FIXED_SURFACE
    result.positionWS = sourcePositionWS;
    result.valid = 1.0;
    result.morph = 0.0;
    return result;
  #endif
  float sourceHeight = terrainProjectHeightAt(result.sourceXZ, result.valid);
  result.morph = result.valid < 0.5 ? 0.0 : terrainProjectClipmapMorphFactor(result.sourceXZ);

  float levelSpacing = material_TerrainVertexSpacing * exp2(renderer_Lod);
  vec2 targetXZ = result.sourceXZ - terrainProjectClipmapVertexShift(positionOS, result.sourceXZ) * levelSpacing;
  float targetValid;
  float targetHeight = terrainProjectHeightAt(targetXZ, targetValid);
  if (targetValid < 0.5) {
    targetXZ = result.sourceXZ;
    targetHeight = sourceHeight;
    result.morph = 0.0;
  }

  vec2 renderedXZ = mix(result.sourceXZ, targetXZ, result.morph);
  result.positionWS = vec3(renderedXZ.x, mix(sourceHeight, targetHeight, result.morph), renderedXZ.y);
  return result;
}

vec3 terrainProjectClipmapGeometryNormal(TerrainProjectClipmapVertex center) {
  float valid;
  return terrainProjectGeometryNormalAt(center.positionWS.xz, valid);
}

vec3 terrainProjectShadingGeometryNormal(vec2 worldXZ, vec3 vertexNormal) {
  #if defined(MATERIAL_TERRAIN_SAND_RIPPLE) && !defined(MATERIAL_TERRAIN_FIXED_SURFACE)
    float valid;
    vec3 bakedNormal = terrainProjectGeometryNormalAt(worldXZ, valid);
    if (valid > 0.5) return bakedNormal;
  #endif
  return normalize(vertexNormal);
}

#endif
