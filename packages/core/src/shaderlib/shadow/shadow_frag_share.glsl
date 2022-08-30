#ifdef CASCADED_SHADOW_MAP_COUNT

// bias, intensity, radius
uniform vec4 u_shadowInfos[CASCADED_SHADOW_MAP_COUNT];
uniform sampler2D u_shadowMaps[CASCADED_SHADOW_MAP_COUNT];
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
#endif

/**
* Degree of shadow.
*/
float getVisibility(const in sampler2D shadowMap, float bias, float intensity, float radius) {
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
    vec2 xy = shadowCoord.xy;
    xy.x *= scaleX;
    xy.y *= scaleY;
    xy += offsets;
    float depth = texture2D(shadowMap, xy).x;
    if (depth <= shadowCoord.z ) {
        return 0.0;
    } else {
        return 1.0;
    }
}

#endif