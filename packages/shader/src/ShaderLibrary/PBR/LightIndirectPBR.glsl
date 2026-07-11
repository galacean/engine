
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

#include "ShaderLibrary/PBR/LightIndirectFunctions.glsl"

#ifdef SCENE_USE_APV
    sampler2D scene_APVIndexTexture;
    sampler2D scene_APVBrickTexture;
    highp sampler2DArray scene_APVSHRTexture;
    highp sampler2DArray scene_APVSHGTexture;
    highp sampler2DArray scene_APVSHBTexture;
    highp sampler2DArray scene_APVSHL2RTexture;
    highp sampler2DArray scene_APVSHL2GTexture;
    highp sampler2DArray scene_APVSHL2BTexture;
    highp sampler2DArray scene_APVSHL2CTexture;
    vec3 scene_APVIndexOrigin;
    vec3 scene_APVIndexDimensions;
    vec2 scene_APVIndexTextureSize;
    vec2 scene_APVBrickTextureSize;
    vec2 scene_APVPoolTextureSize;
    float scene_APVTilesPerRow;
    float scene_APVInvMinBrickSize;
    float scene_APVNormalBias;
    float scene_APVViewBias;
#endif

// ------------------------Diffuse------------------------

// sh need be pre-scaled in CPU.
vec3 getLightProbeIrradiance(vec3 sh[9], vec3 normal){
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

#ifdef SCENE_USE_APV
vec4 sampleAPVPool(highp sampler2DArray poolTexture, vec2 uv, float probeZ){
    float z0 = floor(probeZ);
    float z1 = min(z0 + 1.0, 3.0);
    float zWeight = probeZ - z0;
    vec4 sample0 = textureLod(poolTexture, vec3(uv, z0), 0.0);
    vec4 sample1 = textureLod(poolTexture, vec3(uv, z1), 0.0);
    return mix(sample0, sample1, zWeight);
}

bool sampleAdaptiveProbeVolume(vec3 positionWS, vec3 normalWS, vec3 viewDirWS, out vec3 irradiance){
    vec3 samplePosition = positionWS + normalWS * scene_APVNormalBias + viewDirWS * scene_APVViewBias;
    ivec3 cell = ivec3(floor((samplePosition - scene_APVIndexOrigin) * scene_APVInvMinBrickSize));
    ivec3 indexDimensions = ivec3(scene_APVIndexDimensions);
    if (any(lessThan(cell, ivec3(0))) || any(greaterThanEqual(cell, indexDimensions))) {
        irradiance = vec3(0.0);
        return false;
    }

    int flatCell = cell.x + indexDimensions.x * (cell.y + indexDimensions.y * cell.z);
    int indexWidth = int(scene_APVIndexTextureSize.x);
    ivec2 indexCoord = ivec2(flatCell % indexWidth, flatCell / indexWidth);
    float encodedBrickIndex = texelFetch(scene_APVIndexTexture, indexCoord, 0).r;
    if (encodedBrickIndex < 0.5) {
        irradiance = vec3(0.0);
        return false;
    }

    int brickIndex = int(encodedBrickIndex - 0.5);
    int brickWidth = int(scene_APVBrickTextureSize.x);
    ivec2 brickCoord = ivec2(brickIndex % brickWidth, brickIndex / brickWidth);
    vec4 brickData = texelFetch(scene_APVBrickTexture, brickCoord, 0);
    vec3 probeCoord = clamp((samplePosition - brickData.xyz) * brickData.w, vec3(0.0), vec3(3.0));

    float brickIndexF = float(brickIndex);
    float tileX = mod(brickIndexF, scene_APVTilesPerRow) * 4.0;
    float tileY = floor(brickIndexF / scene_APVTilesPerRow) * 4.0;
    vec2 poolUV = (vec2(tileX, tileY) + probeCoord.xy + 0.5) / scene_APVPoolTextureSize;

    vec4 shR = sampleAPVPool(scene_APVSHRTexture, poolUV, probeCoord.z);
    vec4 shG = sampleAPVPool(scene_APVSHGTexture, poolUV, probeCoord.z);
    vec4 shB = sampleAPVPool(scene_APVSHBTexture, poolUV, probeCoord.z);
    vec4 shL2R = sampleAPVPool(scene_APVSHL2RTexture, poolUV, probeCoord.z);
    vec4 shL2G = sampleAPVPool(scene_APVSHL2GTexture, poolUV, probeCoord.z);
    vec4 shL2B = sampleAPVPool(scene_APVSHL2BTexture, poolUV, probeCoord.z);
    vec3 shL2C = sampleAPVPool(scene_APVSHL2CTexture, poolUV, probeCoord.z).rgb;
    vec3 l0 = vec3(shR.x, shG.x, shB.x);
    vec3 l1Y = vec3(shR.y, shG.y, shB.y);
    vec3 l1Z = vec3(shR.z, shG.z, shB.z);
    vec3 l1X = vec3(shR.w, shG.w, shB.w);
    vec3 l2YX = vec3(shL2R.x, shL2G.x, shL2B.x);
    vec3 l2YZ = vec3(shL2R.y, shL2G.y, shL2B.y);
    vec3 l2Z2 = vec3(shL2R.z, shL2G.z, shL2B.z);
    vec3 l2ZX = vec3(shL2R.w, shL2G.w, shL2B.w);
    irradiance = max(
        l0 +
        l1Y * normalWS.y + l1Z * normalWS.z + l1X * normalWS.x +
        l2YX * (normalWS.y * normalWS.x) +
        l2YZ * (normalWS.y * normalWS.z) +
        l2Z2 * (3.0 * normalWS.z * normalWS.z - 1.0) +
        l2ZX * (normalWS.z * normalWS.x) +
        shL2C * (normalWS.x * normalWS.x - normalWS.y * normalWS.y),
        vec3(0.0)
    );
    return true;
}
#endif


void evaluateDiffuseIBL(Varyings varyings, SurfaceData surfaceData, BSDFData bsdfData, inout vec3 diffuseColor){
    #if defined(SCENE_USE_APV) && !defined(MATERIAL_DISABLE_APV)
    vec3 apvIrradiance;
    if (sampleAdaptiveProbeVolume(surfaceData.position, surfaceData.normal, surfaceData.viewDir, apvIrradiance)) {
        vec3 irradiance = apvIrradiance;
        irradiance *= scene_EnvMapLight.diffuseIntensity;
        diffuseColor += bsdfData.diffuseAO * irradiance * BRDF_Diffuse_Lambert( bsdfData.diffuseColor );
        return;
    }
    #endif

    #ifdef SCENE_USE_SH
        vec3 irradiance = getLightProbeIrradiance(scene_EnvSH, surfaceData.normal);
        irradiance *= scene_EnvMapLight.diffuseIntensity;
    #else
       vec3 irradiance = scene_EnvMapLight.diffuse * scene_EnvMapLight.diffuseIntensity;
       irradiance *= PI;
    #endif
    diffuseColor += bsdfData.diffuseAO * irradiance * BRDF_Diffuse_Lambert( bsdfData.diffuseColor );
}

float evaluateClearCoatIBL(Varyings varyings, SurfaceData surfaceData, BSDFData bsdfData, inout vec3 specularColor){
    float radianceAttenuation = 1.0;

    #ifdef MATERIAL_ENABLE_CLEAR_COAT
        vec3 clearCoatRadiance = getLightProbeRadiance(surfaceData, surfaceData.clearCoatNormal, bsdfData.clearCoatRoughness);
        float specularAO = evaluateSpecularOcclusion(surfaceData.dotNV, bsdfData.diffuseAO, bsdfData.clearCoatRoughness);
        specularColor += specularAO * clearCoatRadiance * surfaceData.clearCoat * envBRDFApprox(bsdfData.clearCoatSpecularColor, 1.0, bsdfData.clearCoatRoughness, surfaceData.clearCoatDotNV);
        radianceAttenuation -= surfaceData.clearCoat * F_Schlick( 0.04, 1.0, surfaceData.clearCoatDotNV);
    #endif

    return radianceAttenuation;
}

void evaluateSpecularIBL(Varyings varyings, SurfaceData surfaceData, BSDFData bsdfData, float radianceAttenuation, inout vec3 outSpecularColor){
    vec3 radiance = getLightProbeRadiance(surfaceData, surfaceData.normal, bsdfData.roughness);
    
    float specularAO = evaluateSpecularOcclusion(surfaceData.dotNV, bsdfData.diffuseAO, bsdfData.roughness);
    outSpecularColor += specularAO * radianceAttenuation * radiance * envBRDFApprox(bsdfData.resolvedSpecularF0, bsdfData.specularF90 , bsdfData.roughness, surfaceData.dotNV) * bsdfData.energyCompensation;
}

void evaluateSheenIBL(Varyings varyings, SurfaceData surfaceData, BSDFData bsdfData,  float radianceAttenuation, inout vec3 diffuseColor, inout vec3 specularColor){
    #ifdef MATERIAL_ENABLE_SHEEN
        diffuseColor *= bsdfData.sheenScaling;
        specularColor *= bsdfData.sheenScaling;
        float specularAO = evaluateSpecularOcclusion(surfaceData.dotNV, bsdfData.diffuseAO, bsdfData.sheenRoughness) ;
        vec3 reflectance = specularAO * radianceAttenuation * bsdfData.approxIBLSheenDG * surfaceData.sheenColor;
        specularColor += reflectance;
    #endif
}

void evaluateIBL(Varyings varyings, SurfaceData surfaceData, BSDFData bsdfData, inout vec3 totalDiffuseColor, inout vec3 totalSpecularColor){
    vec3 diffuseColor = vec3(0);
    vec3 specularColor = vec3(0);

    // IBL diffuse
    FUNCTION_DIFFUSE_IBL(varyings, surfaceData, bsdfData, diffuseColor);

    // IBL ClearCoat
    float radianceAttenuation = FUNCTION_CLEAR_COAT_IBL(varyings, surfaceData, bsdfData, specularColor);

    // IBL specular
    FUNCTION_SPECULAR_IBL(varyings, surfaceData, bsdfData, radianceAttenuation, specularColor);
  
    // IBL sheen
    FUNCTION_SHEEN_IBL(varyings, surfaceData, bsdfData, radianceAttenuation, diffuseColor, specularColor);

    totalDiffuseColor += diffuseColor;
    totalSpecularColor += specularColor;

}

#endif
