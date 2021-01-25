#ifdef O3_POINT_LIGHT_COUNT

struct PointLight {
    vec3 color;
    vec3 position;
    float distance;
    float decay;
};
uniform vec3 u_pointLightColor[ O3_POINT_LIGHT_COUNT ];
uniform vec3 u_pointLightPosition[ O3_POINT_LIGHT_COUNT ];
uniform float u_pointLightDistance[ O3_POINT_LIGHT_COUNT ];
uniform float u_pointLightDecay[ O3_POINT_LIGHT_COUNT ];

#endif
