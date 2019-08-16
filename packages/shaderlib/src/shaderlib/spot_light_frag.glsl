#ifdef R3_SPOT_LIGHT_COUNT

struct SpotLight {
    vec3 color;
    vec3 position;
    vec3 direction;
    float intensity;
    float distance;
    float decay;
    float angle;
    float penumbra;
};
uniform SpotLight u_spotLights[ R3_SPOT_LIGHT_COUNT ];

#endif
