#ifndef TERRAIN_PROJECT_VEGETATION_CORE_DEBUG_INCLUDED
#define TERRAIN_PROJECT_VEGETATION_CORE_DEBUG_INCLUDED

#define TERRAIN_PROJECT_DEBUG_ALPHA 8.0
#define TERRAIN_PROJECT_DEBUG_ALPHA_CUTOFF 9.0
#define TERRAIN_PROJECT_DEBUG_WIND_WEIGHT 10.0
#define TERRAIN_PROJECT_DEBUG_WIND_DISPLACEMENT 11.0
#define TERRAIN_PROJECT_DEBUG_DITHER_THRESHOLD 12.0
#define TERRAIN_PROJECT_DEBUG_GEOMETRY_PARITY 13.0

float terrainProjectDebugDitherThreshold(vec2 fragmentPosition) {
  #ifdef RENDERER_LOD_DITHER
    return texture2D(
      material_LodDitherTexture,
      fragmentPosition * material_LodDitherTextureInvSize
    ).a;
  #else
    return 1.0;
  #endif
}

#endif
