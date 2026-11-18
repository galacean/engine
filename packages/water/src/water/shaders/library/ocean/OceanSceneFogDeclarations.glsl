#ifndef WATER_OCEAN_SCENE_FOG_DECLARATIONS_INCLUDED
#define WATER_OCEAN_SCENE_FOG_DECLARATIONS_INCLUDED
#include "ShaderLibrary/Common/Fog.glsl"

#if SCENE_FOG_MODE != 0
float material_OceanSceneFogEnabled;
#endif

vec4 waterOceanApplySceneFog(vec4 color, vec3 positionVS) {
#if SCENE_FOG_MODE != 0
  if (material_OceanSceneFogEnabled > 0.5) {
    return fog(color, positionVS);
  }
#endif
  return color;
}
#endif
