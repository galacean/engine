#ifndef SCREEN_SPACE_REFLECTION_COMMON_INCLUDED
#define SCREEN_SPACE_REFLECTION_COMMON_INCLUDED

vec2 encodeSSROctNormal(vec3 normal) {
  normal /= max(abs(normal.x) + abs(normal.y) + abs(normal.z), EPSILON);
  vec2 encoded = normal.xy;
  if (normal.z < 0.0) {
    encoded = (1.0 - abs(encoded.yx)) * vec2(encoded.x >= 0.0 ? 1.0 : -1.0, encoded.y >= 0.0 ? 1.0 : -1.0);
  }
  return encoded * 0.5 + 0.5;
}

vec3 decodeSSROctNormal(vec2 encoded) {
  vec2 f = encoded * 2.0 - 1.0;
  vec3 normal = vec3(f, 1.0 - abs(f.x) - abs(f.y));
  if (normal.z < 0.0) {
    normal.xy = (1.0 - abs(normal.yx)) * vec2(normal.x >= 0.0 ? 1.0 : -1.0, normal.y >= 0.0 ? 1.0 : -1.0);
  }
  return normalize(normal);
}

vec4 packSSRNormalRoughness(vec3 worldNormal, float roughness) {
  vec3 n = normalize(worldNormal);
  float r = saturate(roughness);
  #ifdef SSR_PACKED_NORMAL_OCT8
    return vec4(encodeSSROctNormal(n), r, 1.0);
  #else
    return vec4(n, r);
  #endif
}

bool unpackSSRNormalRoughness(vec4 texel, out vec3 worldNormal, out float roughness) {
  #ifdef SSR_PACKED_NORMAL_OCT8
    if (texel.a <= 0.5) {
      worldNormal = vec3(0.0, 1.0, 0.0);
      roughness = 1.0;
      return false;
    }
    worldNormal = decodeSSROctNormal(texel.rg);
    roughness = texel.b;
    return true;
  #else
    float lenSq = dot(texel.rgb, texel.rgb);
    if (lenSq <= 0.25) {
      worldNormal = vec3(0.0, 1.0, 0.0);
      roughness = 1.0;
      return false;
    }
    worldNormal = texel.rgb * inversesqrt(lenSq);
    roughness = texel.a;
    return true;
  #endif
}

// Positive linear eyeDepth (metres). 0.0 denotes empty background when cleared to (0,0,0,0).
vec4 encodeSSRDepth(float eyeDepth, float farClip) {
  #ifdef SSR_PACKED_DEPTH_RG8
    if (eyeDepth <= 0.0) {
      return vec4(0.0);
    }
    float u = sqrt(clamp(eyeDepth / max(farClip, 1e-4), 0.0, 1.0));
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

vec2 ssrClipToTextureUV(vec4 p) {
  vec2 ndc = p.xy / p.w;
  #ifdef GRAPHICS_API_WEBGPU
    ndc.y = -ndc.y;
  #endif
  return ndc * 0.5 + 0.5;
}

vec3 reconstructSSRViewPosition(vec2 uv, float eyeDepth, mat4 invProjMat) {
  vec2 ndc = uv * 2.0 - 1.0;
  #ifdef GRAPHICS_API_WEBGPU
    ndc.y = -ndc.y;
  #endif
  #ifdef CAMERA_ORTHOGRAPHIC
    vec4 viewPoint = invProjMat * vec4(ndc, -1.0, 1.0);
    return vec3(viewPoint.xy / max(viewPoint.w, EPSILON), -eyeDepth);
  #else
    vec4 rayPoint = invProjMat * vec4(ndc, 0.0, 1.0);
    vec3 rayDir = rayPoint.xyz / max(rayPoint.w, EPSILON);
    return rayDir * (eyeDepth / max(-rayDir.z, EPSILON));
  #endif
}

#endif
