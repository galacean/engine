float material_TerrainSandGlintStrength;
vec3 material_TerrainSandGlintColor;
float material_TerrainSandGlintRoughness;

const float terrainProjectSandTiltRange = 0.675;

vec3 terrainProjectGrainRandom(vec2 cell) {
  vec3 value = fract(vec3(cell.xyx) * vec3(0.1031, 0.1137, 0.0973));
  value += dot(value, value.yzx + 19.19);
  return fract((value.xxy + value.yzz) * value.zyx);
}

float terrainProjectResolvedGrain(vec2 grid, vec2 reflectionSlope, float width, float footprint) {
  vec3 grain = terrainProjectGrainRandom(floor(grid));
  vec2 offset = fract(grid) - mix(vec2(0.18), vec2(0.82), grain.xy);
  float radius = mix(0.15, 0.28, grain.z);
  float filterWidth = max(0.045, 0.45 * footprint);
  float body = 1.0 - smoothstep(radius - filterWidth, radius + filterWidth, length(offset));
  // Resolved micro slopes orient the reflective grains within a ripple.
  // The residual tilt varies between grains below the normal map's resolution.
  vec2 grainTilt = (fract(grain.yz * vec2(13.71, 19.53)) * 2.0 - 1.0) * terrainProjectSandTiltRange;
  vec2 mismatch = reflectionSlope - grainTilt;
  float alignment = width * width / (width * width + dot(mismatch, mismatch));
  float lobe = alignment * alignment;
  float spotRadius = radius * mix(0.38, 0.94, alignment);
  vec2 spotCenter = radius * 0.65 * mismatch;
  float spot = 1.0 - smoothstep(spotRadius - filterWidth, spotRadius + filterWidth, length(offset - spotCenter));
  float filteredEnergy = min(1.0, spotRadius / filterWidth);
  return body * spot * filteredEnergy * lobe * mix(1.5, 3.5, grain.z) / width;
}

void terrainProjectApplySandGrains(inout TerrainProjectLightingResult lighting, vec3 positionWS,
  vec3 viewDir, vec3 sandNormalSum, TerrainProjectSandMicroDetail microDetail,
  vec2 dx, vec2 dy, float sandCoverage, float shadowAttenuation) {
  float strength = microDetail.visibility * sandCoverage * (1.0 - terrainProjectSurfaceWetness(1.0)) *
    material_TerrainSandGlintStrength;
  if (strength <= 0.0 || shadowAttenuation <= 0.0) return;
  if (isRendererCulledByLight(renderer_Layer.xy, scene_DirectLightCullingMask[0])) return;
  vec3 normal = normalize(sandNormalSum);
  vec3 lightDir = -scene_DirectLightDirection[0];
  float dotNL = max(dot(normal, lightDir), 0.0);
  vec3 lightView = lightDir + viewDir;
  vec3 halfway = lightView * inversesqrt(max(dot(lightView, lightView), 1.0e-6));
  float dotNH = dot(normal, halfway);
  if (dotNH <= 0.0 || dotNL <= 0.0) return;

  vec3 axis = abs(normal.x) < 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.0, 1.0);
  vec3 tangent = normalize(axis - normal * dot(axis, normal));
  vec2 halfSlope = vec2(dot(halfway, tangent), dot(halfway, cross(tangent, normal))) / max(dotNH, 0.001);
  vec2 reflectionSlope = halfSlope - microDetail.slope * 2.0;
  float width = material_TerrainSandGlintRoughness;
  const float cellsPerMetre = 60.0;
  float footprint = cellsPerMetre * max(length(dx), length(dy));
  float resolved = 1.0 - smoothstep(0.32, 1.0, footprint);
  // Pixels covering many grains retain their mean directional reflection.
  vec2 outside = max(abs(reflectionSlope) - terrainProjectSandTiltRange, vec2(0.0));
  float alignment = width * width / (width * width + dot(outside, outside));
  float highlight = 0.18 * width * alignment * alignment;
  if (resolved > 0.0) {
    float grain = terrainProjectResolvedGrain(positionWS.xz * cellsPerMetre, reflectionSlope, width, footprint);
    highlight = mix(highlight, grain, resolved);
  }
  lighting.directSpecular += scene_DirectLightColor[0] * material_TerrainSandGlintColor *
    (highlight * strength * dotNL * shadowAttenuation);
}
