// directional light
#ifdef O3_DIRECT_LIGHT_COUNT

    struct DirectLight {
        vec3 color;
        vec3 direction;
    };

    uniform vec3 u_directLightColor[O3_DIRECT_LIGHT_COUNT];
    uniform vec3 u_directLightDirection[O3_DIRECT_LIGHT_COUNT];

#endif


// point light
#ifdef O3_POINT_LIGHT_COUNT

    struct PointLight {
        vec3 color;
        vec3 position;
        float distance;
    };

    uniform vec3 u_pointLightColor[ O3_POINT_LIGHT_COUNT ];
    uniform vec3 u_pointLightPosition[ O3_POINT_LIGHT_COUNT ];
    uniform float u_pointLightDistance[ O3_POINT_LIGHT_COUNT ];

#endif


// spot light
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

// ambient light
struct EnvMapLight {
    vec3 diffuse;
    float mipMapLevel;
    float diffuseIntensity;
    float specularIntensity;
};


uniform EnvMapLight u_envMapLight;

#ifdef O3_USE_SH
    uniform vec3 u_env_sh[9];
#endif

#ifdef O3_USE_SPECULAR_ENV
    uniform samplerCube u_env_specularSampler;
#endif
