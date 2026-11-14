#ifndef TERRAIN_PROJECT_GROUND_BLEND_INCLUDED
#define TERRAIN_PROJECT_GROUND_BLEND_INCLUDED

// Terrain and attached ground vegetation must use the same texel-centre convention.
vec2 terrainProjectGroundAtlasUv(vec2 atlasInvSize, vec4 rect, vec4 worldBounds, vec2 worldXZ) {
  vec2 local = clamp((worldXZ - worldBounds.xy) / worldBounds.zw, vec2(0.0), vec2(1.0));
  vec2 grid = local * (rect.zw - vec2(1.0));
  return (rect.xy + grid + vec2(0.5)) * atlasInvSize;
}

vec4 terrainProjectSampleGroundLayerWeights(
  sampler2D atlas,
  vec2 atlasInvSize,
  vec4 rect,
  vec4 worldBounds,
  vec2 worldXZ,
  out float totalWeight
) {
  // Multi-layer residency uses a point-filtered atlas. Filter within the declared
  // rectangle so roots and Terrain keep the same continuous ownership at seams.
  vec2 local = clamp((worldXZ - worldBounds.xy) / worldBounds.zw, vec2(0.0), vec2(1.0));
  vec2 grid = local * (rect.zw - vec2(1.0));
  vec2 low = floor(grid);
  vec2 high = min(low + vec2(1.0), rect.zw - vec2(1.0));
  vec2 fraction = grid - low;
  vec4 a = texture2D(atlas, (rect.xy + low + vec2(0.5)) * atlasInvSize);
  vec4 b = texture2D(atlas, (rect.xy + vec2(high.x, low.y) + vec2(0.5)) * atlasInvSize);
  vec4 c = texture2D(atlas, (rect.xy + vec2(low.x, high.y) + vec2(0.5)) * atlasInvSize);
  vec4 d = texture2D(atlas, (rect.xy + high + vec2(0.5)) * atlasInvSize);
  vec4 weights = mix(mix(a, b, fraction.x), mix(c, d, fraction.x), fraction.y);
  totalWeight = dot(weights, vec4(1.0));
  return weights / max(totalWeight, 0.00001);
}

vec3 terrainProjectBlendGroundBedColor(vec3 baseColor, float baseWeight, vec2 worldXZ,
  sampler2D bedTexture, vec4 bedParameters) {
  if (bedParameters.z < 0.5) return baseColor;
  vec3 bedColor = texture2D(bedTexture, worldXZ / bedParameters.xy).rgb;
  return mix(bedColor, baseColor, clamp(baseWeight, 0.0, 1.0));
}

#endif
