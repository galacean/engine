#ifdef CASCADED_SHADOW_MAP_COUNT

// intensity, radius
uniform vec2 u_shadowInfos[CASCADED_SHADOW_MAP_COUNT];
uniform mat4 u_viewProjMatFromLight[4 * CASCADED_SHADOW_MAP_COUNT];
uniform vec4 u_cascade;

varying vec3 view_pos;

#ifdef GRAPHICS_API_WEBGL2
	const vec2 offsets[4] = vec2[](
        vec2(0, 0),
        vec2(0.5, 0),
        vec2(0, 0.5),
        vec2(0.5, 0.5)
    );
    uniform sampler2DShadow u_shadowMaps[CASCADED_SHADOW_MAP_COUNT];
    #define SAMPLE_TEXTURE2D_SHADOW(textureName, coord3) textureLod(textureName, coord3 , 0.0)
    #define TEXTURE2D_SHADOW_PARAM(shadowMap) mediump sampler2DShadow shadowMap
#else
    uniform sampler2D u_shadowMaps[CASCADED_SHADOW_MAP_COUNT];
	#define SAMPLE_TEXTURE2D_SHADOW(textureName, coord3) (texture2D(textureName, coord3.xy).r < coord3.z ? 0.0 : 1.0)
	#define TEXTURE2D_SHADOW_PARAM(shadowMap) mediump sampler2D shadowMap
#endif

vec3 getShadowCoord() {
    // Get cascade index for the current fragment's view position
    int cascadeIndex = 0;
    for (int i = 0; i < 4 - 1; ++i) {
        if (view_pos.z < u_cascade[i]) {
            cascadeIndex = i + 1;
        }
    }

#ifdef GRAPHICS_API_WEBGL2
    vec2 offsets = offsets[cascadeIndex];
    mat4 viewProjMatFromLight = u_viewProjMatFromLight[cascadeIndex];
#else
    vec2 offsets = vec2(0.0);
    mat4 viewProjMatFromLight;

    if (cascadeIndex == 0) {
        viewProjMatFromLight = u_viewProjMatFromLight[0];
        offsets = vec2(0.0, 0.0);
    } else if (cascadeIndex == 1) {
        viewProjMatFromLight = u_viewProjMatFromLight[1];
        offsets = vec2(0.5, 0.0);
    } else if (cascadeIndex == 2) {
        viewProjMatFromLight = u_viewProjMatFromLight[2];
        offsets = vec2(0.0, 0.5);
    } else {
        viewProjMatFromLight = u_viewProjMatFromLight[3];
        offsets = vec2(0.5, 0.5);
    }
#endif

#if CASCADED_COUNT == 1
    float scaleX = 1.0;
    float scaleY = 1.0;
#endif

#if CASCADED_COUNT == 2
    float scaleX = 0.5;
    float scaleY = 1.0;
#endif

#if CASCADED_COUNT == 4
    float scaleX = 0.5;
    float scaleY = 0.5;
#endif

    vec4 positionFromLight = viewProjMatFromLight * vec4(v_pos, 1.0);
    vec3 shadowCoord = positionFromLight.xyz / positionFromLight.w;
    shadowCoord = shadowCoord * 0.5 + 0.5;
    vec3 coord = shadowCoord.xyz;
    coord.x *= scaleX;
    coord.y *= scaleY;
    coord.xy += offsets;
    return coord;
}

float sampleShadowMapFiltered4(TEXTURE2D_SHADOW_PARAM(shadowMap), vec3 shadowCoord, float offset) {
    float attenuation;
    vec4 attenuation4;
    vec3 shadowCoord0 = shadowCoord + vec3(-offset, -offset, 0.0);
    vec3 shadowCoord1 = shadowCoord + vec3(offset, -offset, 0.0);
    vec3 shadowCoord2 = shadowCoord + vec3(-offset, offset, 0.0);
    vec3 shadowCoord3 = shadowCoord + vec3(offset, offset, 0.0);
    attenuation4.x = SAMPLE_TEXTURE2D_SHADOW(shadowMap, shadowCoord0);
    attenuation4.y = SAMPLE_TEXTURE2D_SHADOW(shadowMap, shadowCoord1);
    attenuation4.z = SAMPLE_TEXTURE2D_SHADOW(shadowMap, shadowCoord2);
    attenuation4.w = SAMPLE_TEXTURE2D_SHADOW(shadowMap, shadowCoord3);
    attenuation = dot(attenuation4, vec4(0.25));
    return attenuation;
}

float sampleShadowMap(TEXTURE2D_SHADOW_PARAM(shadowMap), float strength, float offset) {
    vec3 shadowCoord = getShadowCoord();
    float attenuation = 1.0;
    if(shadowCoord.z > 0.0 && shadowCoord.z < 1.0) {
#if SHADOW_FILTER_COUNT == 1
        attenuation = SAMPLE_TEXTURE2D_SHADOW(shadowMap, shadowCoord);
#endif

#if SHADOW_FILTER_COUNT == 4
        attenuation = sampleShadowMapFiltered4(shadowMap, shadowCoord, offset);
#endif

#if SHADOW_FILTER_COUNT == 9
        attenuation = SAMPLE_TEXTURE2D_SHADOW(shadowMap, shadowCoord);
#endif
	    attenuation = mix(1.0, attenuation, strength);
    }
    return attenuation;
}

#endif