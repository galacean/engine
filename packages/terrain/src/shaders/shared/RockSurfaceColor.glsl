#ifndef TERRAIN_PROJECT_ROCK_SURFACE_COLOR_INCLUDED
#define TERRAIN_PROJECT_ROCK_SURFACE_COLOR_INCLUDED

sampler2D material_OriginalRockTexture;
float material_OriginalRockTextureScale;

// Positive global values override the per-rock OBB scale; zero selects automatic tiling.
float rockTextureScale(float localScale) {
  return max(material_OriginalRockTextureScale > 0.0 ? material_OriginalRockTextureScale : localScale, 0.01);
}
vec3 originalRockColor(vec3 position, vec3 normal, float localScale) {
  vec3 n = normalize(normal), p = position / rockTextureScale(localScale);
  vec3 signs = vec3(n.x < 0.0 ? -1.0 : 1.0, n.y < 0.0 ? -1.0 : 1.0, n.z < 0.0 ? -1.0 : 1.0);
  vec3 weights = pow(abs(n), vec3(4.0));
  weights /= max(dot(weights, vec3(1.0)), 0.00001);
  vec3 color = texture2D(material_OriginalRockTexture, vec2(-signs.x * p.z, p.y)).rgb * weights.x
    + texture2D(material_OriginalRockTexture, vec2(p.x, -signs.y * p.z)).rgb * weights.y
    + texture2D(material_OriginalRockTexture, vec2(signs.z * p.x, p.y)).rgb * weights.z;
  return vec3(dot(color, vec3(0.2126, 0.7152, 0.0722)));
}

#endif
