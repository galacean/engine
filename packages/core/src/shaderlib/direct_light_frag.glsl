#ifdef O3_DIRECT_LIGHT_COUNT

struct DirectLight {
    vec3 color;
    vec3 direction;
};

uniform vec3 u_directLightColor[O3_DIRECT_LIGHT_COUNT];
uniform vec3 u_directLightDirection[O3_DIRECT_LIGHT_COUNT];
#endif
