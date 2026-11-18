#ifndef SCREEN_SPACE_REFLECTION_INCLUDED
#define SCREEN_SPACE_REFLECTION_INCLUDED

vec2 encodeScreenSpaceReflectionNormal(vec3 normal) {
  normal /= max(abs(normal.x) + abs(normal.y) + abs(normal.z), EPSILON);
  vec2 encoded = normal.xy;
  if (normal.z < 0.0) {
    encoded = (1.0 - abs(encoded.yx)) * vec2(encoded.x >= 0.0 ? 1.0 : -1.0, encoded.y >= 0.0 ? 1.0 : -1.0);
  }
  return encoded * 0.5 + 0.5;
}

vec3 decodeScreenSpaceReflectionNormal(vec2 encoded) {
  vec2 f = encoded * 2.0 - 1.0;
  vec3 normal = vec3(f, 1.0 - abs(f.x) - abs(f.y));
  if (normal.z < 0.0) {
    normal.xy = (1.0 - abs(normal.yx)) * vec2(normal.x >= 0.0 ? 1.0 : -1.0, normal.y >= 0.0 ? 1.0 : -1.0);
  }
  return normalize(normal);
}

// RG stores an oct8 world-space normal. Camera rotation must not move a static
// surface across quantization bins; B/A retain roughness and response weight.
vec4 packScreenSpaceReflectionSurface(vec3 worldNormal, float roughness, float responseWeight) {
  return vec4(encodeScreenSpaceReflectionNormal(normalize(worldNormal)), saturate(roughness), saturate(responseWeight));
}

vec3 decodeScreenSpaceReflectionViewNormal(vec2 encoded) {
  return normalize(mat3(camera_ViewMat) * decodeScreenSpaceReflectionNormal(encoded));
}

vec3 reconstructScreenSpaceReflectionViewPositionFromEyeDepth(vec2 uv, float eyeDepth) {
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3(
    ndc.x * eyeDepth / camera_ProjMat[0][0],
    ndc.y * eyeDepth / camera_ProjMat[1][1],
    -eyeDepth
  );
}

vec3 reconstructScreenSpaceReflectionViewPosition(vec2 uv, float rawDepth) {
  return reconstructScreenSpaceReflectionViewPositionFromEyeDepth(uv, remapDepthBufferEyeDepth(rawDepth));
}

#endif
