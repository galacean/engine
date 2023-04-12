// Directional light
#ifdef O3_DIRECT_LIGHT_COUNT

    struct DirectLight {
        vec3 color;
        vec3 direction;
    };

    uniform ivec2 u_directLightCullingMask[O3_DIRECT_LIGHT_COUNT];
    uniform vec3 u_directLightColor[O3_DIRECT_LIGHT_COUNT];
    uniform vec3 u_directLightDirection[O3_DIRECT_LIGHT_COUNT];

#endif


// Point light
#ifdef O3_POINT_LIGHT_COUNT

    struct PointLight {
        vec3 color;
        vec3 position;
        float distance;
    };

    uniform ivec2 u_pointLightCullingMask[ O3_POINT_LIGHT_COUNT ];
    uniform vec3 u_pointLightColor[ O3_POINT_LIGHT_COUNT ];
    uniform vec3 u_pointLightPosition[ O3_POINT_LIGHT_COUNT ];
    uniform float u_pointLightDistance[ O3_POINT_LIGHT_COUNT ];

#endif


// Spot light
#ifdef O3_SPOT_LIGHT_COUNT

    struct SpotLight {
        vec3 color;
        vec3 position;
        vec3 direction;
        float distance;
        float angleCos;
        float penumbraCos;
    };

    uniform ivec2 u_spotLightCullingMask[ O3_SPOT_LIGHT_COUNT ];
    uniform vec3 u_spotLightColor[ O3_SPOT_LIGHT_COUNT ];
    uniform vec3 u_spotLightPosition[ O3_SPOT_LIGHT_COUNT ];
    uniform vec3 u_spotLightDirection[ O3_SPOT_LIGHT_COUNT ];
    uniform float u_spotLightDistance[ O3_SPOT_LIGHT_COUNT ];
    uniform float u_spotLightAngleCos[ O3_SPOT_LIGHT_COUNT ];
    uniform float u_spotLightPenumbraCos[ O3_SPOT_LIGHT_COUNT ];

#endif

// Ambient light
struct EnvMapLight {
    vec3 diffuse;
    float mipMapLevel;
    float diffuseIntensity;
    float specularIntensity;
};


uniform EnvMapLight u_envMapLight;
uniform highp ivec4 oasis_RendererLayer;

#ifdef O3_USE_SH
    uniform vec3 u_env_sh[9];
#endif

#ifdef O3_USE_SPECULAR_ENV
    uniform samplerCube u_env_specularSampler;
#endif

#ifndef GRAPHICS_API_WEBGL2
bool isBitSet(float value, float mask, float bitIndex)
{
    return mod(floor(value / pow(2.0, bitIndex)), 2.0) == 1.0 && mod(floor(mask / pow(2.0, bitIndex)), 2.0) == 1.0;
}
#endif

bool isRendererCulledByLight(ivec2 rendererLayer, ivec2 lightCullingMask)
{
    #ifdef GRAPHICS_API_WEBGL2
    return !((rendererLayer.x & lightCullingMask.x) != 0 || (rendererLayer.y & lightCullingMask.y) != 0);
    #else
    for (int i = 0; i < 16; i++) {
        if (isBitSet( float(rendererLayer.x), float(lightCullingMask.x), float(i)) || isBitSet( float(rendererLayer.y), float(lightCullingMask.y), float(i))) {
            return false;
        }
    }
    return true;
    #endif
}