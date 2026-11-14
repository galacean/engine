#ifndef TERRAIN_PROJECT_GRASS_SURFACE_FIELD_INCLUDED
#define TERRAIN_PROJECT_GRASS_SURFACE_FIELD_INCLUDED

#include "shared/GrassColorField.glsl"

// Surface and attached blades use the same distance at their shared root.
float terrainProjectGrassSurfaceField(vec3 positionWS) {
  float vista = grassColorFieldVistaBlendWeight(positionWS);
  return mix(sampleGrassColorField(positionWS.xz), sampleGrassVistaColorField(positionWS.xz), vista);
}

vec3 terrainProjectGrassSurfaceColor(vec3 positionWS) {
  return grassColorFromField(terrainProjectGrassSurfaceField(positionWS));
}

#endif
