#ifndef LIGHT_INCLUDED
#define LIGHT_INCLUDED


ivec4 renderer_Layer;
#ifndef GRAPHICS_API_WEBGL2
    bool isBitSet(float value, float mask, float bitIndex){
        return mod(floor(value / pow(2.0, bitIndex)), 2.0) == 1.0 && mod(floor(mask / pow(2.0, bitIndex)), 2.0) == 1.0;
    }
#endif

bool isRendererCulledByLight(ivec2 rendererLayer, ivec2 lightCullingMask){
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

// Directional light
#ifdef SCENE_DIRECT_LIGHT_COUNT

    struct DirectLight {
        vec3 color;
        vec3 direction;
    };

    ivec2 scene_DirectLightCullingMask[SCENE_DIRECT_LIGHT_COUNT];
    vec3 scene_DirectLightColor[SCENE_DIRECT_LIGHT_COUNT];
    vec3 scene_DirectLightDirection[SCENE_DIRECT_LIGHT_COUNT];

    #ifdef GRAPHICS_API_WEBGL2
        DirectLight getDirectLight(int index){
            DirectLight light;
            light.color = scene_DirectLightColor[index];
            light.direction = scene_DirectLightDirection[index];
    
            return light;
        }
    #endif

#endif


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

    #ifdef GRAPHICS_API_WEBGL2
        PointLight getPointLight(int index){
            PointLight light;
            light.color = scene_PointLightColor[index];
            light.position = scene_PointLightPosition[index];
            light.distance = scene_PointLightDistance[index];

            return light;
        }
    #endif

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

    #ifdef GRAPHICS_API_WEBGL2
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


#endif

// Ambient light
struct EnvMapLight {
    vec3 diffuse;
    float mipMapLevel;
    float diffuseIntensity;
    float specularIntensity;
};


EnvMapLight scene_EnvMapLight;

#ifdef SCENE_USE_SH
    vec3 scene_EnvSH[9];
#endif

#ifdef SCENE_USE_SPECULAR_ENV
    samplerCube scene_EnvSpecularSampler;
#endif




#endif
