#ifndef VARYINGS_PBR_INCLUDED
#define VARYINGS_PBR_INCLUDED

#include "Shadow.glsl"

struct Varyings{
	vec2 uv;
	#ifdef RENDERER_HAS_UV1
	    vec2 uv1;
	#endif

	#ifdef RENDERER_ENABLE_VERTEXCOLOR
  		vec4 vertexColor;
	#endif

	vec3 positionWS;

	#if SCENE_FOG_MODE != 0
	    vec3 positionVS;
	#endif

	#ifdef RENDERER_HAS_NORMAL
	    vec3 normalWS;
	    #ifdef RENDERER_HAS_TANGENT
			vec3 tangentWS;
			vec3 bitangentWS;
	    #endif
	#endif


	#if defined(NEED_CALCULATE_SHADOWS) && (SCENE_SHADOW_CASCADED_COUNT == 1)
	    vec3 shadowCoord;
	#endif
};


#endif