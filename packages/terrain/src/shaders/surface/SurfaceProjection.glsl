#ifndef TERRAIN_PROJECT_SURFACE_PROJECTION_INCLUDED
#define TERRAIN_PROJECT_SURFACE_PROJECTION_INCLUDED
float material_WorldTextureSize;
float material_WorldNormalTextureSize;
#ifdef RENDERER_SURFACE_TEXTURE_SIZE
float renderer_SurfaceTextureSize;
#endif
float surfaceTextureSize() {
  #ifdef RENDERER_SURFACE_TEXTURE_SIZE
    return max(material_WorldTextureSize > 0.0 ? material_WorldTextureSize : renderer_SurfaceTextureSize, 0.01);
  #else
    return max(material_WorldTextureSize, 0.01);
  #endif
}

vec3 surfaceProjectionWeights(vec3 normal) {
  vec3 weights = pow(abs(normal), vec3(4.0));
  return weights / max(dot(weights, vec3(1.0)), 0.00001);
}
vec3 surfaceProjectionGradient(vec3 encoded, vec3 tangent, vec3 bitangent) {
  vec3 n = encoded * 2.0 - 1.0;
  return -(tangent * n.x + bitangent * n.y) / max(n.z, 0.1);
}
vec4 surfaceWorldBase(sampler2D source, vec3 position, vec3 normal) {
  vec3 p = position / surfaceTextureSize();
  vec3 signs = sign(normal + vec3(0.000001));
  vec3 w = surfaceProjectionWeights(normal);
  return texture2DSRGB(source, vec2(-signs.x * p.z, p.y)) * w.x
    + texture2DSRGB(source, vec2(p.x, -signs.y * p.z)) * w.y
    + texture2DSRGB(source, vec2(signs.z * p.x, p.y)) * w.z;
}
vec3 surfaceWorldNormal(sampler2D source, vec3 position, vec3 normal, float strength) {
  vec3 p = position / max(material_WorldNormalTextureSize > 0.0 ? material_WorldNormalTextureSize : surfaceTextureSize(), 0.01);
  vec3 signs = sign(normal + vec3(0.000001));
  vec3 w = surfaceProjectionWeights(normal);
  vec3 gradient = surfaceProjectionGradient(texture2D(source, vec2(-signs.x * p.z, p.y)).rgb,
      vec3(0.0, 0.0, -signs.x), vec3(0.0, 1.0, 0.0)) * w.x
    + surfaceProjectionGradient(texture2D(source, vec2(p.x, -signs.y * p.z)).rgb,
      vec3(1.0, 0.0, 0.0), vec3(0.0, 0.0, -signs.y)) * w.y
    + surfaceProjectionGradient(texture2D(source, vec2(signs.z * p.x, p.y)).rgb,
      vec3(signs.z, 0.0, 0.0), vec3(0.0, 1.0, 0.0)) * w.z;
  gradient -= normal * dot(normal, gradient);
  return normalize(normal - strength * gradient);
}
#endif
