#ifndef LIGHT_INDIRECT_FUNCTIONS_INCLUDED
#define LIGHT_INDIRECT_FUNCTIONS_INCLUDED
#include "Light.glsl"

vec3 getReflectedVector(SurfaceData surfaceData, vec3 n) {
    #ifdef MATERIAL_ENABLE_ANISOTROPY
        vec3 r = reflect(-surfaceData.viewDir, surfaceData.anisotropicN);
    #else
        vec3 r = reflect(-surfaceData.viewDir, n);
    #endif

    return r;
}

float getSpecularMIPLevel(float roughness, int maxMIPLevel ) {
    return roughness * float(maxMIPLevel);
}

// sh need be pre-scaled in CPU.
vec3 getLightProbeRadiance(SurfaceData surfaceData, vec3 normal, float roughness) {

    #ifndef SCENE_USE_SPECULAR_ENV
        return vec3(0);
    #else
        vec3 reflectVec = getReflectedVector(surfaceData, normal);
        reflectVec.x = -reflectVec.x; // TextureCube is left-hand,so x need inverse
        
        float specularMIPLevel = getSpecularMIPLevel(roughness, int(scene_EnvMapLight.mipMapLevel) );

        #ifdef HAS_TEX_LOD
            vec4 envMapColor = textureCubeLodEXT( scene_EnvSpecularSampler, reflectVec, specularMIPLevel );
        #else
            vec4 envMapColor = textureCube( scene_EnvSpecularSampler, reflectVec, specularMIPLevel );
        #endif

        #ifdef SCENE_IS_DECODE_ENV_RGBM
            envMapColor.rgb = (RGBMToLinear(envMapColor, 5.0)).rgb;
        #else
            envMapColor = gammaToLinear(envMapColor);
        #endif
        
        return envMapColor.rgb * scene_EnvMapLight.specularIntensity;

    #endif
}
#endif