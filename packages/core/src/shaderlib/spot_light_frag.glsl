#ifdef O3_SPOT_LIGHT_COUNT

struct SpotLight {
    vec3 color;
    vec3 position;
    vec3 direction;
    float distance;
    float decay;
    float angle;
    float penumbra;
    float penumbraCos;
    float coneCos;
};

uniform vec3 u_spotLightColor[ O3_SPOT_LIGHT_COUNT ];
uniform vec3 u_spotLightPosition[ O3_SPOT_LIGHT_COUNT ];
uniform vec3 u_spotLightDirection[ O3_SPOT_LIGHT_COUNT ];
uniform float u_spotLightDistance[ O3_SPOT_LIGHT_COUNT ];
uniform float u_spotLightDecay[ O3_SPOT_LIGHT_COUNT ];
uniform float u_spotLightAngle[ O3_SPOT_LIGHT_COUNT ];
uniform float u_spotLightPenumbra[ O3_SPOT_LIGHT_COUNT ];
uniform float u_spotLightPenumbraCos[ O3_SPOT_LIGHT_COUNT ];
uniform float u_spotLightConeCos[ O3_SPOT_LIGHT_COUNT ];

#endif
