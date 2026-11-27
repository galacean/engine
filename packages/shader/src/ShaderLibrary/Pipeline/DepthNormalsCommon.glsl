#ifndef DEPTH_NORMALS_COMMON_INCLUDED
#define DEPTH_NORMALS_COMMON_INCLUDED

vec2 encodeOctNormal(vec3 normal) {
  normal /= max(abs(normal.x) + abs(normal.y) + abs(normal.z), EPSILON);
  vec2 encoded = normal.xy;
  if (normal.z < 0.0) {
    encoded = (1.0 - abs(encoded.yx)) * vec2(encoded.x >= 0.0 ? 1.0 : -1.0, encoded.y >= 0.0 ? 1.0 : -1.0);
  }
  return encoded * 0.5 + 0.5;
}

vec3 decodeOctNormal(vec2 encoded) {
  vec2 f = encoded * 2.0 - 1.0;
  vec3 normal = vec3(f, 1.0 - abs(f.x) - abs(f.y));
  if (normal.z < 0.0) {
    normal.xy = (1.0 - abs(normal.yx)) * vec2(normal.x >= 0.0 ? 1.0 : -1.0, normal.y >= 0.0 ? 1.0 : -1.0);
  }
  return normalize(normal);
}

vec4 packDepthNormals(vec3 worldNormal, float roughness) {
  vec3 n = normalize(worldNormal);
  float r = saturate(roughness);
  #ifdef CAMERA_DEPTH_NORMALS_PACKED_OCT8
    return vec4(encodeOctNormal(n), r, 1.0);
  #else
    return vec4(n, r);
  #endif
}

bool unpackDepthNormals(vec4 texel, out vec3 worldNormal, out float roughness) {
  #ifdef CAMERA_DEPTH_NORMALS_PACKED_OCT8
    if (texel.a <= 0.5) {
      worldNormal = vec3(0.0, 1.0, 0.0);
      roughness = 1.0;
      return false;
    }
    worldNormal = decodeOctNormal(texel.rg);
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

#endif
