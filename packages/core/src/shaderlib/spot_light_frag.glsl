#ifdef O3_SPOT_LIGHT_COUNT

struct SpotLight {
    vec3 color;
    vec3 lightColor;
    vec3 position;
    vec3 direction;
    float intensity;
    float distance;
    float decay;
    float angle;
    float penumbra;
    float coneCos;
    float penumbraCos;
};
uniform SpotLight u_spotLights[ O3_SPOT_LIGHT_COUNT ];

#endif
