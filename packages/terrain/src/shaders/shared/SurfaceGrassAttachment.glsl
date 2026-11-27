#ifndef TERRAIN_PROJECT_SURFACE_GRASS_ATTACHMENT_INCLUDED
#define TERRAIN_PROJECT_SURFACE_GRASS_ATTACHMENT_INCLUDED

#if defined(RENDERER_SURFACE_GRASS_ATTACHMENT) && defined(RENDERER_SEED_WORLD_DETAIL_COMPACT)
  #define TERRAIN_PROJECT_SURFACE_GRASS_ATTACHMENT_ACTIVE

  vec3 terrainProjectAlignGrassToSurface(vec3 value, vec3 surfaceNormal) {
    vec3 normal = normalize(surfaceNormal);
    vec3 axis = vec3(normal.z, 0.0, -normal.x);
    float sine = length(axis);
    if (sine <= 0.00001) return value;
    axis /= sine;
    float cosine = clamp(normal.y, -1.0, 1.0);
    return value * cosine + cross(axis, value) * sine + axis * dot(axis, value) * (1.0 - cosine);
  }

  vec3 terrainProjectSurfaceGrassNormal(vec3 surfaceNormal) {
    return normalize(surfaceNormal);
  }
#endif

#endif
