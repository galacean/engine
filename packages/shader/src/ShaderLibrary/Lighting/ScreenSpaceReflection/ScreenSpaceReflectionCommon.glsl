#ifndef SCREEN_SPACE_REFLECTION_COMMON_INCLUDED
#define SCREEN_SPACE_REFLECTION_COMMON_INCLUDED

#include "ShaderLibrary/Pipeline/DepthNormalsCommon.glsl"

// Positive linear eyeDepth (metres). 0.0 denotes empty background when cleared to (0,0,0,0).
vec4 encodeSSRDepth(float eyeDepth, float farClip) {
  #ifdef SSR_PACKED_DEPTH_RG8
    if (eyeDepth <= 0.0) {
      return vec4(0.0);
    }
    float u = sqrt(min(eyeDepth / farClip, 1.0));
    float encoded = floor(u * 65535.0 + 0.5);
    float hi = floor(encoded / 256.0);
    float lo = encoded - hi * 256.0;
    return vec4(hi / 255.0, lo / 255.0, 0.0, 1.0);
  #else
    return vec4(clamp(eyeDepth, 0.0, 65000.0), 0.0, 0.0, 1.0);
  #endif
}

float decodeSSRDepth(vec4 texel, float farClip) {
  #ifdef SSR_PACKED_DEPTH_RG8
    vec2 bytes = floor(texel.rg * 255.0 + 0.5);
    float u = (bytes.x * 256.0 + bytes.y) / 65535.0;
    return (u * u) * farClip;
  #else
    return texel.r;
  #endif
}

float getSSRFarSentinel(float farClip) {
  #ifdef SSR_PACKED_DEPTH_RG8
    return farClip * 0.999;
  #else
    return min(farClip, 65000.0) * 0.999;
  #endif
}

vec3 reconstructSSRViewPosition(vec2 uv, float eyeDepth, mat4 invProjMat) {
  vec2 ndc = uv * 2.0 - 1.0;
  #ifdef CAMERA_ORTHOGRAPHIC
    vec4 viewPoint = invProjMat * vec4(ndc, -1.0, 1.0);
    return vec3(viewPoint.xy / max(viewPoint.w, EPSILON), -eyeDepth);
  #else
    vec4 rayPoint = invProjMat * vec4(ndc, 0.0, 1.0);
    vec3 rayDir = rayPoint.xyz / max(rayPoint.w, EPSILON);
    return rayDir * (eyeDepth / max(-rayDir.z, EPSILON));
  #endif
}

// Each destination texel covers an inclusive source rectangle, including shared edge pixels at odd sizes.
ivec4 getSSRDepthFootprint(ivec2 coord, ivec2 srcSize, ivec2 dstSize) {
  ivec2 first = clamp(coord * srcSize / dstSize, ivec2(0), srcSize - 1);
  ivec2 last = clamp(((coord + 1) * srcSize + dstSize - 1) / dstSize - 1, first, srcSize - 1);
  return ivec4(first, last);
}

bool useSSRClearCoat(float clearCoat, float coatRoughness, float baseRoughness) {
  return clearCoat > 0.1 && coatRoughness < baseRoughness;
}

#endif
