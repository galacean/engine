// Directional light
#ifdef O3_DIRECT_LIGHT_COUNT

    struct DirectLight {
        vec3 color;
        vec3 direction;
    };

    uniform ivec2 galacean_DirectLightCullingMask[O3_DIRECT_LIGHT_COUNT];
    uniform vec3 galacean_DirectLightColor[O3_DIRECT_LIGHT_COUNT];
    uniform vec3 galacean_DirectLightDirection[O3_DIRECT_LIGHT_COUNT];

#endif


// Point light
#ifdef O3_POINT_LIGHT_COUNT

    struct PointLight {
        vec3 color;
        vec3 position;
        float distance;
    };

    uniform ivec2 galacean_PointLightCullingMask[ O3_POINT_LIGHT_COUNT ];
    uniform vec3 galacean_PointLightColor[ O3_POINT_LIGHT_COUNT ];
    uniform vec3 galacean_PointLightPosition[ O3_POINT_LIGHT_COUNT ];
    uniform float galacean_PointLightDistance[ O3_POINT_LIGHT_COUNT ];

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

    uniform ivec2 galacean_SpotLightCullingMask[ O3_SPOT_LIGHT_COUNT ];
    uniform vec3 galacean_SpotLightColor[ O3_SPOT_LIGHT_COUNT ];
    uniform vec3 galacean_SpotLightPosition[ O3_SPOT_LIGHT_COUNT ];
    uniform vec3 galacean_SpotLightDirection[ O3_SPOT_LIGHT_COUNT ];
    uniform float galacean_SpotLightDistance[ O3_SPOT_LIGHT_COUNT ];
    uniform float galacean_SpotLightAngleCos[ O3_SPOT_LIGHT_COUNT ];
    uniform float galacean_SpotLightPenumbraCos[ O3_SPOT_LIGHT_COUNT ];

#endif

// Ambient light
struct EnvMapLight {
    vec3 diffuse;
    float mipMapLevel;
    float diffuseIntensity;
    float specularIntensity;
};


uniform EnvMapLight u_envMapLight;
uniform ivec4 galacean_RendererLayer;

#ifdef GALACEAN_USE_SH
    uniform vec3 galacean_EnvSH[9];
#endif

#ifdef GALACEAN_USE_SPECULAR_ENV
    uniform samplerCube galacean_EnvSpecularSampler;
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
