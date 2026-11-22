#ifndef LIGHT_INDIRECT_FUNCTIONS_INCLUDED
#define LIGHT_INDIRECT_FUNCTIONS_INCLUDED

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

        float specularMIPLevel = getSpecularMIPLevel(roughness, int(scene_EnvMapLight.mipMapLevel) );

        vec4 envMapColor = textureLod( scene_EnvSpecularSampler, reflectVec, specularMIPLevel );

        #ifdef SCENE_USE_SPECULAR_ENV_BLEND
            float specularMIPLevel2 = getSpecularMIPLevel(roughness, int(scene_EnvMapLight.mipMapLevel2));
            vec4 envMapColor2 = textureCubeLodEXT(scene_EnvSpecularSampler2, reflectVec, specularMIPLevel2);
            envMapColor = mix(envMapColor, envMapColor2, scene_EnvMapLight.specularTextureBlend);
        #endif
        return envMapColor.rgb * scene_EnvMapLight.specularIntensity;

    #endif
}

float evaluateSpecularOcclusion(float dotNV, float diffuseAO, float roughness){
    float specularAOFactor = 1.0;
        #if (defined(MATERIAL_HAS_OCCLUSION_TEXTURE) || defined(SCENE_ENABLE_AMBIENT_OCCLUSION)) && defined(SCENE_USE_SPECULAR_ENV)
            specularAOFactor = saturate( pow(dotNV + diffuseAO, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + diffuseAO );
        #endif
    return specularAOFactor;
}

#ifdef MATERIAL_ENABLE_CLEAR_COAT
vec3 evaluateClearCoatIBLResponse(SurfaceData surfaceData, BSDFData bsdfData) {
    float specularAO = evaluateSpecularOcclusion(
        surfaceData.clearCoatDotNV,
        bsdfData.diffuseAO,
        bsdfData.clearCoatRoughness
    );
    return specularAO * envBRDFApprox(
        bsdfData.clearCoatSpecularColor,
        1.0,
        bsdfData.clearCoatRoughness,
        surfaceData.clearCoatDotNV
    );
}
#endif

#endif
