#ifndef LIGHT_INCLUDED
#define LIGHT_INCLUDED


ivec4 renderer_Layer;

bool isRendererCulledByLight(ivec2 rendererLayer, ivec2 lightCullingMask){
    return !((rendererLayer.x & lightCullingMask.x) != 0 || (rendererLayer.y & lightCullingMask.y) != 0);
}

// Directional light
#ifdef SCENE_DIRECT_LIGHT_COUNT

    struct DirectLight {
        vec3 color;
        vec3 direction;
    };

    ivec2 scene_DirectLightCullingMask[SCENE_DIRECT_LIGHT_COUNT];
    vec3 scene_DirectLightColor[SCENE_DIRECT_LIGHT_COUNT];
    vec3 scene_DirectLightDirection[SCENE_DIRECT_LIGHT_COUNT];

        DirectLight getDirectLight(int index){
            DirectLight light;
            light.color = scene_DirectLightColor[index];
            light.direction = scene_DirectLightDirection[index];

            return light;
        }

#endif


// Windowed inverse-square distance attenuation (Frostbite / Filament); cutoffDistance <= 0 disables range cutoff
float getDistanceAttenuation(float distanceSq, float cutoffDistance) {
    float attenuation = 1.0 / max(distanceSq, 1e-4);
    if (cutoffDistance > 0.0) {
        // Invert before squaring for large cutoffs, and scale distanceSq first for small cutoffs to avoid FP32 overflow
        float invDistance = 1.0 / cutoffDistance;
        float factor = min((distanceSq * invDistance) * invDistance, 1.0);
        float smoothFactor = 1.0 - factor * factor;
        attenuation *= smoothFactor * smoothFactor;
    }
    return attenuation;
}

// Point light
#ifdef SCENE_POINT_LIGHT_COUNT

    struct PointLight {
        vec3 color;
        vec3 position;
        float distance;
    };

    ivec2 scene_PointLightCullingMask[ SCENE_POINT_LIGHT_COUNT ];
    vec3 scene_PointLightColor[ SCENE_POINT_LIGHT_COUNT ];
    vec3 scene_PointLightPosition[ SCENE_POINT_LIGHT_COUNT ];
    float scene_PointLightDistance[ SCENE_POINT_LIGHT_COUNT ];

        PointLight getPointLight(int index){
            PointLight light;
            light.color = scene_PointLightColor[index];
            light.position = scene_PointLightPosition[index];
            light.distance = scene_PointLightDistance[index];

            return light;
        }

#endif


// Spot light
#ifdef SCENE_SPOT_LIGHT_COUNT

    struct SpotLight {
        vec3 color;
        vec3 position;
        vec3 direction;
        float distance;
        float angleCos;
        float penumbraCos;
    };

    ivec2 scene_SpotLightCullingMask[ SCENE_SPOT_LIGHT_COUNT ];
    vec3 scene_SpotLightColor[ SCENE_SPOT_LIGHT_COUNT ];
    vec3 scene_SpotLightPosition[ SCENE_SPOT_LIGHT_COUNT ];
    vec3 scene_SpotLightDirection[ SCENE_SPOT_LIGHT_COUNT ];
    float scene_SpotLightDistance[ SCENE_SPOT_LIGHT_COUNT ];
    float scene_SpotLightAngleCos[ SCENE_SPOT_LIGHT_COUNT ];
    float scene_SpotLightPenumbraCos[ SCENE_SPOT_LIGHT_COUNT ];

        SpotLight getSpotLight(int index){
            SpotLight light;
            light.color = scene_SpotLightColor[index];
            light.position = scene_SpotLightPosition[index];
            light.direction = scene_SpotLightDirection[index];
            light.distance = scene_SpotLightDistance[index];
            light.angleCos = scene_SpotLightAngleCos[index];
            light.penumbraCos = scene_SpotLightPenumbraCos[index];

            return light;
        }


#endif

// Ambient light
struct EnvMapLight {
    vec3 diffuse;
    float mipMapLevel;
    float diffuseIntensity;
    float specularIntensity;
    float mipMapLevel2;
    float specularTextureBlend;
};


EnvMapLight scene_EnvMapLight;

#ifdef SCENE_USE_SH
    #ifdef SCENE_USE_REALTIME_SH
        #include "ShaderLibrary/Lighting/RealtimeSphericalHarmonics.glsl"
    #else
        vec3 scene_EnvSH[9];
    #endif
#endif

#ifdef SCENE_USE_SPECULAR_ENV
    samplerCube scene_EnvSpecularSampler;
    #ifdef SCENE_USE_SPECULAR_ENV_BLEND
        samplerCube scene_EnvSpecularSampler2;
    #endif
#endif




#endif
