#ifndef TERRAIN_PROJECT_ROCK_SURFACE_COLOR_INCLUDED
#define TERRAIN_PROJECT_ROCK_SURFACE_COLOR_INCLUDED

sampler2D material_OriginalRockTexture;
float material_OriginalRockTextureScale;

vec3 originalRockColor(vec3 position, vec3 normal, float cellOffset) {
  vec3 p = position / material_OriginalRockTextureScale;
  vec2 offset = vec2(cellOffset);
  float yz = texture2D(material_OriginalRockTexture, p.zy + offset).r;
  float xy = texture2D(material_OriginalRockTexture, p.xy + offset).r;
  float xz = texture2D(material_OriginalRockTexture, p.xz + offset).r;
  vec3 scores = abs(normal).xzy + vec3(yz, xy, xy);
  float threshold = max(scores.x, max(scores.y, scores.z)) - 0.2;
  vec3 weights = max(scores - vec3(threshold), vec3(0.0));
  return vec3((yz * weights.x + xy * weights.y + xz * weights.z)
    / max(weights.x + weights.y + weights.z, 0.00001));
}

#endif
