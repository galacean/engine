#ifdef O3_SHADOW_MAP_COUNT

uniform mat4 u_viewMatFromLight[O3_SHADOW_MAP_COUNT];
uniform mat4 u_projMatFromLight[O3_SHADOW_MAP_COUNT];
varying vec4 v_PositionFromLight[O3_SHADOW_MAP_COUNT];

#endif
