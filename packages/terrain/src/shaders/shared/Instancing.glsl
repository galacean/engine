#ifndef TERRAIN_PROJECT_INSTANCING_INCLUDED
#define TERRAIN_PROJECT_INSTANCING_INCLUDED

#if defined(RENDERER_LOD_DITHER) && !defined(RENDERER_PROCEDURAL_TREE_VARIATION_CATALOG)
float renderer_LodFade;
#endif

float terrainProjectLodFade() {
  #if defined(RENDERER_LOD_DITHER) && !defined(RENDERER_PROCEDURAL_TREE_VARIATION_CATALOG)
    return clamp(renderer_LodFade, -1.0, 1.0);
  #else
    return 1.0;
  #endif
}

#endif
