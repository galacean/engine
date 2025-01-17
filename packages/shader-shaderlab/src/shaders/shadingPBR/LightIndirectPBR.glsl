
#ifndef LIGHT_INDIRECT_PBR_INCLUDED
#define LIGHT_INDIRECT_PBR_INCLUDED

#ifndef FUNCTION_DIFFUSE_IBL
    #define FUNCTION_DIFFUSE_IBL evaluateDiffuseIBL
#endif
#ifndef FUNCTION_SPECULAR_IBL
    #define FUNCTION_SPECULAR_IBL evaluateSpecularIBL
#endif
#ifndef FUNCTION_CLEAR_COAT_IBL
    #define FUNCTION_CLEAR_COAT_IBL evaluateClearCoatIBL
#endif
#ifndef FUNCTION_SHEEN_IBL
    #define FUNCTION_SHEEN_IBL evaluateSheenIBL
#endif
#include "BRDF.glsl"
#include "Light.glsl"
#include "LightIndirectFunctions.glsl"

// ------------------------Diffuse------------------------

// sh need be pre-scaled in CPU.
vec3 getLightProbeIrradiance(vec3 sh[9], vec3 normal){
      normal.x = -normal.x;
      vec3 result = sh[0] +

            sh[1] * (normal.y) +
            sh[2] * (normal.z) +
            sh[3] * (normal.x) +

            sh[4] * (normal.y * normal.x) +
            sh[5] * (normal.y * normal.z) +
            sh[6] * (3.0 * normal.z * normal.z - 1.0) +
            sh[7] * (normal.z * normal.x) +
            sh[8] * (normal.x * normal.x - normal.y * normal.y);
    
    return max(result, vec3(0.0));

}


void evaluateDiffuseIBL(Varyings varyings, SurfaceData surfaceData, BRDFData brdfData, inout vec3 diffuseColor){
    #ifdef SCENE_USE_SH
        vec3 irradiance = getLightProbeIrradiance(scene_EnvSH, surfaceData.normal);
        #ifdef ENGINE_IS_COLORSPACE_GAMMA
            irradiance = (linearToGamma(vec4(irradiance, 1.0))).rgb;
        #endif
        irradiance *= scene_EnvMapLight.diffuseIntensity;
    #else
       vec3 irradiance = scene_EnvMapLight.diffuse * scene_EnvMapLight.diffuseIntensity;
       irradiance *= PI;
    #endif

    diffuseColor += surfaceData.diffuseAO * irradiance * BRDF_Diffuse_Lambert( brdfData.diffuseColor );
}

float evaluateClearCoatIBL(Varyings varyings, SurfaceData surfaceData, BRDFData brdfData, inout vec3 specularColor){
    float radianceAttenuation = 1.0;

    #ifdef MATERIAL_ENABLE_CLEAR_COAT
        vec3 clearCoatRadiance = getLightProbeRadiance(surfaceData, surfaceData.clearCoatNormal, brdfData.clearCoatRoughness);
        specularColor += surfaceData.specularAO * clearCoatRadiance * surfaceData.clearCoat * envBRDFApprox(brdfData.clearCoatSpecularColor, brdfData.clearCoatRoughness, surfaceData.clearCoatDotNV);
        radianceAttenuation -= surfaceData.clearCoat * F_Schlick(surfaceData.f0, surfaceData.clearCoatDotNV);
    #endif

    return radianceAttenuation;
}

void evaluateSpecularIBL(Varyings varyings, SurfaceData surfaceData, BRDFData brdfData, float radianceAttenuation, inout vec3 outSpecularColor){
    vec3 radiance = getLightProbeRadiance(surfaceData, surfaceData.normal, brdfData.roughness);
  
    #ifdef MATERIAL_ENABLE_IRIDESCENCE
        vec3 speculaColor = mix(brdfData.specularColor, brdfData.iridescenceSpecularColor, surfaceData.iridescenceFactor);
    #else
        vec3 speculaColor = brdfData.specularColor;
    #endif

    outSpecularColor += surfaceData.specularAO * radianceAttenuation * radiance * brdfData.envSpecularDFG;
}

void evaluateSheenIBL(Varyings varyings, SurfaceData surfaceData, BRDFData brdfData,  float radianceAttenuation, inout vec3 diffuseColor, inout vec3 specularColor){
    #ifdef MATERIAL_ENABLE_SHEEN
        diffuseColor *= brdfData.sheenScaling;
        specularColor *= brdfData.sheenScaling;

        vec3 reflectance = surfaceData.specularAO * radianceAttenuation * brdfData.approxIBLSheenDG * surfaceData.sheenColor;
        specularColor += reflectance;
    #endif
}

void evaluateIBL(Varyings varyings, SurfaceData surfaceData, BRDFData brdfData, inout vec3 totalDiffuseColor, inout vec3 totalSpecularColor){
    vec3 diffuseColor = vec3(0);
    vec3 specularColor = vec3(0);

    // IBL diffuse
    FUNCTION_DIFFUSE_IBL(varyings, surfaceData, brdfData, diffuseColor);

    // IBL ClearCoat
    float radianceAttenuation = FUNCTION_CLEAR_COAT_IBL(varyings, surfaceData, brdfData, specularColor);

    // IBL specular
    FUNCTION_SPECULAR_IBL(varyings, surfaceData, brdfData, radianceAttenuation, specularColor);
  
    // IBL sheen
    FUNCTION_SHEEN_IBL(varyings, surfaceData, brdfData, radianceAttenuation, diffuseColor, specularColor);

    totalDiffuseColor += diffuseColor;
    totalSpecularColor += specularColor;

}

#endif