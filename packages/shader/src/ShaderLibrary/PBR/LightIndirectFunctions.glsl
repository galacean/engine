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

        #ifdef HAS_TEX_LOD
            vec4 envMapColor = textureCubeLodEXT( scene_EnvSpecularSampler, reflectVec, specularMIPLevel );
        #else
            vec4 envMapColor = textureCube( scene_EnvSpecularSampler, reflectVec, specularMIPLevel );
        #endif

        #ifdef ENGINE_NO_SRGB
            envMapColor = sRGBToLinear(envMapColor);
        #endif

        #ifdef SCENE_USE_SPECULAR_ENV_BLEND
            float specularMIPLevel2 = getSpecularMIPLevel(roughness, int(scene_EnvMapLight.mipMapLevel2));
            #ifdef HAS_TEX_LOD
                vec4 envMapColor2 = textureCubeLodEXT(scene_EnvSpecularSampler2, reflectVec, specularMIPLevel2);
            #else
                vec4 envMapColor2 = textureCube(scene_EnvSpecularSampler2, reflectVec, specularMIPLevel2);
            #endif
            #ifdef ENGINE_NO_SRGB
                envMapColor2 = sRGBToLinear(envMapColor2);
            #endif
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

#endif
