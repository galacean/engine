#include "shared/RockSurfaceColor.glsl"
sampler2D material_WorldRockNormal;
float material_WorldRockNormalStrength;
float material_WorldRockProjectionEnable;
float material_WorldGrassEnable;
float material_WorldGrassCoverageFromMesh;
float material_WorldGrassSlope;
#ifdef RENDERER_ROCK_TEXTURE_SCALE
 float renderer_RockTextureScale;
#endif
float rockLocalTextureScale() {
 #ifdef RENDERER_ROCK_TEXTURE_SCALE
  return renderer_RockTextureScale;
 #else
  return 1.0;
 #endif
}

vec3 rockProjectionGradient(vec3 sampleNormal, vec3 tangent, vec3 bitangent) {
  vec3 n = sampleNormal * 2.0 - 1.0;
  return -(tangent * n.x + bitangent * n.y) / max(n.z, 0.1);
}

void originalRockSurface(inout SurfaceData surface, Varyings v) {
  vec3 n = normalize(v.normalWS);
  vec3 p = v.positionWS / rockTextureScale(rockLocalTextureScale());
  vec3 signs = vec3(n.x < 0.0 ? -1.0 : 1.0, n.y < 0.0 ? -1.0 : 1.0, n.z < 0.0 ? -1.0 : 1.0);
  vec3 weights = pow(abs(n), vec3(4.0));
  weights /= max(dot(weights, vec3(1.0)), 0.00001);
  vec2 uvX = vec2(-signs.x * p.z, p.y);
  vec2 uvY = vec2(p.x, -signs.y * p.z);
  vec2 uvZ = vec2(signs.z * p.x, p.y);
  surface.albedoColor = mix(vec3(1.0), originalRockColor(v.positionWS, n, rockLocalTextureScale()),
    material_WorldRockProjectionEnable);
  vec3 gradient = rockProjectionGradient(texture2D(material_WorldRockNormal, uvX).rgb,
      vec3(0.0, 0.0, -signs.x), vec3(0.0, 1.0, 0.0)) * weights.x
    + rockProjectionGradient(texture2D(material_WorldRockNormal, uvY).rgb,
      vec3(1.0, 0.0, 0.0), vec3(0.0, 0.0, -signs.y)) * weights.y
    + rockProjectionGradient(texture2D(material_WorldRockNormal, uvZ).rgb,
      vec3(signs.z, 0.0, 0.0), vec3(0.0, 1.0, 0.0)) * weights.z;
  gradient -= n * dot(n, gradient);
  surface.normal = normalize(n - material_WorldRockProjectionEnable * material_WorldRockNormalStrength * gradient);
  surface.dotNV = saturate(dot(surface.normal, surface.viewDir));
}
