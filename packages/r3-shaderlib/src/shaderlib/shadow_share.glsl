#ifdef R3_GENERATE_SHADOW_MAP

uniform mat4 u_viewMatFromLight;
uniform mat4 u_projMatFromLight;

#endif

#ifdef R3_SHADOW_MAP_COUNT

uniform mat4 u_viewMatFromLight[R3_SHADOW_MAP_COUNT];
uniform mat4 u_projMatFromLight[R3_SHADOW_MAP_COUNT];
varying vec4 v_PositionFromLight[R3_SHADOW_MAP_COUNT];

#endif
