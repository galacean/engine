#ifdef O3_SPOT_LIGHT_COUNT

struct SpotLight {
    vec3 color;
    vec3 position;
    vec3 direction;
    float distance;
    float angleCos;
    float penumbraCos;
};

uniform vec3 u_spotLightColor[ O3_SPOT_LIGHT_COUNT ];
uniform vec3 u_spotLightPosition[ O3_SPOT_LIGHT_COUNT ];
uniform vec3 u_spotLightDirection[ O3_SPOT_LIGHT_COUNT ];
uniform float u_spotLightDistance[ O3_SPOT_LIGHT_COUNT ];
uniform float u_spotLightAngleCos[ O3_SPOT_LIGHT_COUNT ];
uniform float u_spotLightPenumbraCos[ O3_SPOT_LIGHT_COUNT ];

#endif
