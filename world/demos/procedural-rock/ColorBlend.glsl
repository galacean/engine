#ifndef TERRAIN_PROJECT_ROCK_COLOR_UNIFORM
#define TERRAIN_PROJECT_ROCK_COLOR_UNIFORM
vec3 material_RockColor;
#endif

vec3 rockPaletteStone(vec3 textureColor) {
  return textureColor * material_RockColor;
}
