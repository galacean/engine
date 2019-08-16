#ifdef R3_POINT_LIGHT_COUNT

struct PointLight {
    vec3 color;
    vec3 position;
    float intensity;
    float distance;
    float decay;
};
uniform PointLight u_pointLights[ R3_POINT_LIGHT_COUNT ];

#endif
