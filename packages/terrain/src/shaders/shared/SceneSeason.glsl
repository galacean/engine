#ifndef TERRAIN_PROJECT_SCENE_SEASON_INCLUDED
#define TERRAIN_PROJECT_SCENE_SEASON_INCLUDED

// Scene-owned seasonal data. Weather systems do not publish or mutate these values.
// x: spring, y: summer, z: autumn, w: winter.
vec4 scene_SeasonState;
// rgb: CPU-normalized unit-luminance target tone, a: tone influence.
vec4 scene_GrassSeasonColor;
vec4 scene_TreeLeafSeasonColor;
vec4 scene_TreeBarkSeasonColor;

// Season owns the species vocabulary. Materials bind one of these symbols instead of
// duplicating numeric category ids or naming Scene uniforms directly.
#define TERRAIN_PROJECT_SEASON_SPECIES_GRASS scene_GrassSeasonColor
#define TERRAIN_PROJECT_SEASON_SPECIES_TREE_LEAF scene_TreeLeafSeasonColor
#define TERRAIN_PROJECT_SEASON_SPECIES_TREE_BARK scene_TreeBarkSeasonColor
#define TERRAIN_PROJECT_SEASON_LUMINANCE vec3(0.2126, 0.7152, 0.0722)

vec3 terrainProjectApplySeasonColor(vec3 sourceColor, vec4 seasonColor) {
  float sourceLuminance = dot(sourceColor, TERRAIN_PROJECT_SEASON_LUMINANCE);
  vec3 seasonTone = seasonColor.rgb * sourceLuminance;
  return mix(sourceColor, seasonTone, clamp(seasonColor.a, 0.0, 1.0));
}

// Author overrides compose after the Scene's inherited tone, independently for each RGB channel.
vec3 terrainProjectApplyAuthoredSeasonColor(vec3 sourceColor, vec4 seasonColor, vec3 authoredChannels) {
  return mix(terrainProjectApplySeasonColor(sourceColor, seasonColor), sourceColor, authoredChannels);
}

vec3 terrainProjectPlantAuthoredChannels() {
  vec3 mask = vec3(0.0);
  #ifdef RENDERER_PLANT_COLOR_OVERRIDE_R
    mask.r = 1.0;
  #endif
  #ifdef RENDERER_PLANT_COLOR_OVERRIDE_G
    mask.g = 1.0;
  #endif
  #ifdef RENDERER_PLANT_COLOR_OVERRIDE_B
    mask.b = 1.0;
  #endif
  return mask;
}

#endif
