#ifndef TERRAIN_PROJECT_GRASS_SURFACE_FIELD_INCLUDED
#define TERRAIN_PROJECT_GRASS_SURFACE_FIELD_INCLUDED

#include "shared/GrassColorField.glsl"

// Surface and attached blades use the same distance at their shared root.
// Explicit world-XZ derivatives keep early-return vista branches free of divergent quad mip artifacts.
float terrainProjectGrassSurfaceFieldGrad(vec3 positionWS, vec2 posDx, vec2 posDy) {
  float vista = grassColorFieldVistaBlendWeight(positionWS);
  if (vista <= 0.001) return sampleGrassColorFieldGrad(positionWS.xz, posDx, posDy);
  if (vista >= 0.999) return sampleGrassVistaColorFieldGrad(positionWS.xz, posDx, posDy);
  return mix(
    sampleGrassColorFieldGrad(positionWS.xz, posDx, posDy),
    sampleGrassVistaColorFieldGrad(positionWS.xz, posDx, posDy),
    vista
  );
}

float terrainProjectGrassSurfaceField(vec3 positionWS) {
  return terrainProjectGrassSurfaceFieldGrad(positionWS, vec2(0.0), vec2(0.0));
}

vec3 terrainProjectGrassSurfaceColor(vec3 positionWS) {
  return grassColorFromField(terrainProjectGrassSurfaceField(positionWS));
}

#endif
