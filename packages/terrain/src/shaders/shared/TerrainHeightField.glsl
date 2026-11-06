#ifndef TERRAIN_PROJECT_HEIGHT_FIELD_INCLUDED
#define TERRAIN_PROJECT_HEIGHT_FIELD_INCLUDED
#include "shared/TerrainRegions.glsl"

sampler2D material_TerrainHeightAtlas;
vec2 material_TerrainHeightAtlasInvSize;
sampler2D material_TerrainNormalAtlas;
vec4 material_TerrainRegionAtlasRects[TERRAIN_PROJECT_MAX_ACTIVE_REGIONS];
vec2 material_TerrainRegionHeightDecode[TERRAIN_PROJECT_MAX_ACTIVE_REGIONS];

float terrainProjectDecodeR16(vec2 atlasTexel) {
  vec2 bytes = texture2D(
    material_TerrainHeightAtlas,
    (atlasTexel + vec2(0.5)) * material_TerrainHeightAtlasInvSize
  ).rg * 255.0;
  return (bytes.x + bytes.y * 256.0) / 65535.0;
}

float terrainProjectHeightAt(vec2 worldXZ, out float valid) {
  int regionIndex = terrainProjectRegionIndex(worldXZ);
  if (regionIndex < 0) {
    valid = 0.0;
    return 0.0;
  }

  vec4 bounds = GROUND_TerrainRegionWorldBounds[regionIndex];
  vec4 atlasRect = material_TerrainRegionAtlasRects[regionIndex];
  vec2 local = clamp((worldXZ - bounds.xy) / bounds.zw, vec2(0.0), vec2(1.0));
  vec2 grid = local * (atlasRect.zw - vec2(1.0));
  vec2 gridMinimum = floor(grid);
  vec2 gridMaximum = min(gridMinimum + vec2(1.0), atlasRect.zw - vec2(1.0));
  vec2 blend = grid - gridMinimum;
  vec2 atlasMinimum = atlasRect.xy + gridMinimum;
  vec2 atlasMaximum = atlasRect.xy + gridMaximum;
  float height00 = terrainProjectDecodeR16(atlasMinimum);
  float height10 = terrainProjectDecodeR16(vec2(atlasMaximum.x, atlasMinimum.y));
  float height01 = terrainProjectDecodeR16(vec2(atlasMinimum.x, atlasMaximum.y));
  float height11 = terrainProjectDecodeR16(atlasMaximum);
  float normalizedHeight = mix(mix(height00, height10, blend.x), mix(height01, height11, blend.x), blend.y);
  vec2 decode = material_TerrainRegionHeightDecode[regionIndex];
  valid = 1.0;
  return decode.x + normalizedHeight * decode.y;
}

vec3 terrainProjectGeometryNormalAt(vec2 worldXZ, out float valid) {
  int regionIndex = terrainProjectRegionIndex(worldXZ);
  if (regionIndex < 0) {
    valid = 0.0;
    return vec3(0.0, 1.0, 0.0);
  }
  vec4 bounds = GROUND_TerrainRegionWorldBounds[regionIndex];
  vec4 atlasRect = material_TerrainRegionAtlasRects[regionIndex];
  vec2 local = clamp((worldXZ - bounds.xy) / bounds.zw, vec2(0.0), vec2(1.0));
  vec2 grid = local * (atlasRect.zw - vec2(1.0));
  vec2 encodedXZ = texture2D(
    material_TerrainNormalAtlas,
    (atlasRect.xy + grid + vec2(0.5)) * material_TerrainHeightAtlasInvSize
  ).rg * 2.0 - 1.0;
  float normalY = sqrt(max(1.0 - dot(encodedXZ, encodedXZ), 0.0));
  valid = 1.0;
  return normalize(vec3(encodedXZ.x, normalY, encodedXZ.y));
}

#endif
