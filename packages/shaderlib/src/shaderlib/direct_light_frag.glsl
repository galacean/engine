#ifdef O3_DIRECT_LIGHT_COUNT

struct DirectLight {
    vec3 color;
    vec3 lightColor;
    float intensity;
    vec3 direction;
};
uniform DirectLight u_directLights[ O3_DIRECT_LIGHT_COUNT ];

#endif
