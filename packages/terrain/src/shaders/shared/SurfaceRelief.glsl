#ifndef TERRAIN_PROJECT_SURFACE_RELIEF_INCLUDED
#define TERRAIN_PROJECT_SURFACE_RELIEF_INCLUDED

sampler2D camera_SurfaceReliefHeightTexture;
sampler2D camera_SurfaceReliefMaskTexture;
sampler2D camera_SurfaceReliefBakedNormal;
// Z is the mirrored period in metres; W is the repeating tile resolution.
vec4 camera_SurfaceReliefBakedDomain;
vec4 camera_SurfaceReliefDomain;
vec4 camera_SurfaceReliefOptions;

bool terrainProjectSurfaceReliefEnabled() {
  return camera_SurfaceReliefOptions.x > 0.5;
}

float terrainProjectSurfaceReliefWeight(vec3 worldPosition) {
  if (!terrainProjectSurfaceReliefEnabled()) return 0.0;
  return 1.0 - smoothstep(50.0, 60.0, distance(camera_Position, worldPosition));
}

float terrainProjectSurfaceReliefPattern(vec2 worldXZ) {
  vec2 patternUV = worldXZ * vec2(1.0, -1.0) * 0.05000000074505806;
  patternUV = vec2(1.0) - abs(mod(patternUV, vec2(2.0)) - vec2(1.0));
  // The shared color pattern has opposite V orientation and a different scalar range.
  // Sample base level explicitly: palette softness must not change the normal field.
  patternUV.y = 1.0 - patternUV.y;
  float colorField = textureLod(camera_SurfaceReliefHeightTexture, patternUV, 0.0).r;
  return clamp((colorField - 0.1752408761) / 0.7947308464, 0.0, 1.0);
}

vec3 terrainProjectSurfaceReliefMask(vec2 worldXZ) {
  float resolution = camera_SurfaceReliefDomain.w;
  vec2 maskUV = (clamp((worldXZ - camera_SurfaceReliefDomain.xy) / camera_SurfaceReliefDomain.z,
    0.0, 1.0) * (resolution - 1.0) + 0.5) / resolution;
  return texture2D(camera_SurfaceReliefMaskTexture, maskUV).rgb;
}

vec2 terrainProjectSurfaceReliefPatternGradient(vec2 worldXZ) {
  // XYZ encoding is affine, so one hardware-filtered read interpolates decoded normals.
  vec3 normal = texture2D(camera_SurfaceReliefBakedNormal, worldXZ / camera_SurfaceReliefBakedDomain.z).rgb * 2.0 - 1.0;
  // A common normalization factor cancels in the slope ratio.
  return -normal.xz / max(normal.y, 0.00001);
}

vec2 terrainProjectSurfaceReliefGradient(vec2 worldXZ) {
  vec2 gradient = terrainProjectSurfaceReliefPatternGradient(worldXZ);
  {
    // Product-rule approximation: d(M * (H - reference)). The mask stays in
    // world space while the independent normal map repeats locally.
    vec3 maskData = terrainProjectSurfaceReliefMask(worldXZ);
    float mask = maskData.r;
    // RGB8 stores coverage and signed differences across a 2 * 0.3619918823m stencil.
    // Affine decoding commutes with bilinear filtering; byte 128 is zero slope.
    vec2 maskGradient = (maskData.gb * 255.0 - 128.0) / (127.0 * 0.7239837646484375);
    float heightOffset = -1.7999999523162842 *
      (terrainProjectSurfaceReliefPattern(worldXZ) - 0.7931822538375854);
    gradient = mask * gradient + heightOffset * maskGradient;
  }
  return gradient;
}

vec3 terrainProjectApplyReliefGradient(vec3 terrainNormal, vec2 gradient, float influence) {
  // Add only the virtual gradient to the existing physical slope, exactly once.
  vec3 normal = normalize(terrainNormal - vec3(gradient.x, 0.0, gradient.y) * terrainNormal.y);
  return normalize(mix(terrainNormal, normal, influence));
}

vec3 terrainProjectSurfaceReliefNormal(vec3 worldPosition, vec3 terrainNormal, float grassCoverage) {
  float influence = camera_SurfaceReliefOptions.y > 0.5 ? 1.0 : clamp(grassCoverage, 0.0, 1.0);
  return terrainProjectApplyReliefGradient(terrainNormal, terrainProjectSurfaceReliefGradient(worldPosition.xz), influence);
}

// Mesh surfaces own their coverage. Never read the terrain mask beneath a rock.
vec3 terrainProjectAttachedReliefNormal(vec3 positionWS, vec3 normal, float coverage) {
  float weight = terrainProjectSurfaceReliefWeight(positionWS);
  if (weight <= 0.0) return normal;
  return normalize(mix(normal, terrainProjectApplyReliefGradient(normal,
    terrainProjectSurfaceReliefPatternGradient(positionWS.xz), clamp(coverage, 0.0, 1.0)), weight));
}

#endif
