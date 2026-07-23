
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

#ifdef SCENE_USE_PROBE_VOLUME
    #define PROBE_VOLUME_MAX_ACTIVE_CELLS 16
    #ifndef SCENE_PROBE_VOLUME_PER_RENDERER
        highp sampler2DArray scene_ProbeVolumeSHRTexture;
        highp sampler2DArray scene_ProbeVolumeSHGTexture;
        highp sampler2DArray scene_ProbeVolumeSHBTexture;
        #ifdef SCENE_PROBE_VOLUME_SCENARIO_BLEND
            float scene_ProbeVolumeScenarioBlend;
            float scene_ProbeVolumeScenarioLayerOffset;
        #endif
        highp sampler2DArray scene_ProbeVolumeSkyTexture;
    #endif
    vec4 scene_ProbeVolumeCellOrigins[PROBE_VOLUME_MAX_ACTIVE_CELLS];
    vec4 scene_ProbeVolumeCellParameters[PROBE_VOLUME_MAX_ACTIVE_CELLS];
    int scene_ProbeVolumeCellCount;
    vec3 scene_ProbeVolumeAtlasDimensions;
    float scene_ProbeVolumeInverseSpacing;
    float scene_ProbeVolumeNormalBias;
    float scene_ProbeVolumeViewBias;
    mat4 scene_ProbeVolumeWorldToLocal;
    mat4 scene_ProbeVolumeLocalToWorld;
    #ifdef SCENE_PROBE_VOLUME_PER_RENDERER
        vec4 renderer_ProbeVolumeSHR;
        vec4 renderer_ProbeVolumeSHG;
        vec4 renderer_ProbeVolumeSHB;
        vec4 renderer_ProbeVolumeSky;
        float renderer_ProbeVolumeWeight;
    #endif
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

#ifdef SCENE_USE_PROBE_VOLUME
#ifndef SCENE_PROBE_VOLUME_PER_RENDERER
vec4 sampleProbeVolumeTexture(
    highp sampler2DArray probeTexture,
    vec2 uv,
    float probeZ,
    float cellDepth,
    float layerOffset
){
    float z0 = floor(probeZ);
    float z1 = min(z0 + 1.0, cellDepth - 1.0);
    vec4 sample0 = textureLod(probeTexture, vec3(uv, z0 + layerOffset), 0.0);
    vec4 sample1 = textureLod(probeTexture, vec3(uv, z1 + layerOffset), 0.0);
    return mix(sample0, sample1, probeZ - z0);
}
#endif

vec3 evaluateProbeL1(vec4 shR, vec4 shG, vec4 shB, vec3 normalWS){
    vec3 l0 = max(vec3(shR.x, shG.x, shB.x), vec3(0.0));
    vec3 l1Y = vec3(shR.y, shG.y, shB.y);
    vec3 l1Z = vec3(shR.z, shG.z, shB.z);
    vec3 l1X = vec3(shR.w, shG.w, shB.w);
    vec3 l1Length = sqrt(l1X * l1X + l1Y * l1Y + l1Z * l1Z);
    vec3 l1Scale = min(vec3(1.0), l0 / max(l1Length, vec3(1e-4)));
    return max(l0 + l1Y * l1Scale * normalWS.y + l1Z * l1Scale * normalWS.z + l1X * l1Scale * normalWS.x, vec3(0.0));
}

vec3 getGlobalDiffuseIrradiance(vec3 normalWS){
    #ifdef SCENE_USE_SH
        return getLightProbeIrradiance(scene_EnvSH, normalWS);
    #else
        return scene_EnvMapLight.diffuse * PI;
    #endif
}

vec3 addDynamicSkyIrradiance(vec3 staticIrradiance, vec4 skyData, vec3 normalWS){
    float skyOcclusion = clamp(
        skyData.x + skyData.y * normalWS.y + skyData.z * normalWS.z + skyData.w * normalWS.x,
        0.0,
        1.0
    );
    if (skyOcclusion <= 0.0) {
        return staticIrradiance;
    }
    return staticIrradiance +
        getGlobalDiffuseIrradiance(normalWS) * scene_EnvMapLight.diffuseIntensity * skyOcclusion;
}

bool sampleProbeVolume(vec3 positionWS, vec3 normalWS, vec3 viewDirWS, out vec3 irradiance){
    #ifdef SCENE_PROBE_VOLUME_PER_RENDERER
        irradiance = addDynamicSkyIrradiance(
            evaluateProbeL1(renderer_ProbeVolumeSHR, renderer_ProbeVolumeSHG, renderer_ProbeVolumeSHB, normalWS),
            renderer_ProbeVolumeSky,
            normalWS
        );
        return renderer_ProbeVolumeWeight > 0.0;
    #else
    vec3 biasedPositionWS = positionWS + normalWS * scene_ProbeVolumeNormalBias + viewDirWS * scene_ProbeVolumeViewBias;
    vec3 samplePosition = (scene_ProbeVolumeWorldToLocal * vec4(biasedPositionWS, 1.0)).xyz;
    vec3 probeCoord = vec3(0.0);
    vec4 cellParameters = vec4(0.0);
    bool foundCell = false;
    float nearestCellDistance = 1e20;
    for (int cellIndex = 0; cellIndex < PROBE_VOLUME_MAX_ACTIVE_CELLS; cellIndex++) {
        if (cellIndex >= scene_ProbeVolumeCellCount) {
            break;
        }
        vec3 candidateCoord = (samplePosition - scene_ProbeVolumeCellOrigins[cellIndex].xyz) * scene_ProbeVolumeInverseSpacing;
        vec3 maxProbeCoord = scene_ProbeVolumeCellParameters[cellIndex].xyz - 1.0;
        vec3 clampedCoord = clamp(candidateCoord, vec3(0.0), maxProbeCoord);
        float cellDistance = length(candidateCoord - clampedCoord);
        if (cellDistance <= 1.0 && cellDistance < nearestCellDistance) {
            probeCoord = clampedCoord;
            cellParameters = scene_ProbeVolumeCellParameters[cellIndex];
            foundCell = true;
            nearestCellDistance = cellDistance;
        }
    }
    if (!foundCell) {
        irradiance = vec3(0.0);
        return false;
    }
    vec2 atlasCoord = vec2(probeCoord.x, probeCoord.y + cellParameters.w);
    vec2 uv = (atlasCoord + 0.5) / scene_ProbeVolumeAtlasDimensions.xy;
    vec4 shR = sampleProbeVolumeTexture(scene_ProbeVolumeSHRTexture, uv, probeCoord.z, cellParameters.z, 0.0);
    vec4 shG = sampleProbeVolumeTexture(scene_ProbeVolumeSHGTexture, uv, probeCoord.z, cellParameters.z, 0.0);
    vec4 shB = sampleProbeVolumeTexture(scene_ProbeVolumeSHBTexture, uv, probeCoord.z, cellParameters.z, 0.0);
    #ifdef SCENE_PROBE_VOLUME_SCENARIO_BLEND
        vec4 targetShR = sampleProbeVolumeTexture(
            scene_ProbeVolumeSHRTexture,
            uv,
            probeCoord.z,
            cellParameters.z,
            scene_ProbeVolumeScenarioLayerOffset
        );
        vec4 targetShG = sampleProbeVolumeTexture(
            scene_ProbeVolumeSHGTexture,
            uv,
            probeCoord.z,
            cellParameters.z,
            scene_ProbeVolumeScenarioLayerOffset
        );
        vec4 targetShB = sampleProbeVolumeTexture(
            scene_ProbeVolumeSHBTexture,
            uv,
            probeCoord.z,
            cellParameters.z,
            scene_ProbeVolumeScenarioLayerOffset
        );
        shR = mix(shR, targetShR, scene_ProbeVolumeScenarioBlend);
        shG = mix(shG, targetShG, scene_ProbeVolumeScenarioBlend);
        shB = mix(shB, targetShB, scene_ProbeVolumeScenarioBlend);
    #endif
    vec4 skyData = sampleProbeVolumeTexture(scene_ProbeVolumeSkyTexture, uv, probeCoord.z, cellParameters.z, 0.0);
    irradiance = addDynamicSkyIrradiance(evaluateProbeL1(shR, shG, shB, normalWS), skyData, normalWS);
    return true;
    #endif
}
#endif


void evaluateDiffuseIBL(Varyings varyings, SurfaceData surfaceData, BSDFData bsdfData, inout vec3 diffuseColor){
    #ifdef SCENE_USE_PROBE_VOLUME
        vec3 irradiance = getGlobalDiffuseIrradiance(surfaceData.normal);
    #elif defined(SCENE_USE_SH)
        vec3 irradiance = getLightProbeIrradiance(scene_EnvSH, surfaceData.normal);
    #else
        vec3 irradiance = scene_EnvMapLight.diffuse * PI;
    #endif
    irradiance *= scene_EnvMapLight.diffuseIntensity;

    #if defined(SCENE_USE_PROBE_VOLUME) && !defined(MATERIAL_DISABLE_PROBE_VOLUME)
    vec3 probeIrradiance;
    bool hasProbe;
    #if defined(SCENE_PROBE_VOLUME_PER_VERTEX) && defined(RENDERER_HAS_NORMAL)
        probeIrradiance = varyings.probeIrradiance;
        hasProbe = varyings.probeWeight > 0.999 && dot(probeIrradiance, vec3(1.0)) > 1e-5;
        if (!hasProbe) {
            // Large editor meshes can have every vertex outside the volume even
            // when most fragments are inside. Keep those boundary primitives correct.
            hasProbe = sampleProbeVolume(surfaceData.position, surfaceData.normal, surfaceData.viewDir, probeIrradiance);
        }
    #else
        hasProbe = sampleProbeVolume(surfaceData.position, surfaceData.normal, surfaceData.viewDir, probeIrradiance);
    #endif
    if (hasProbe) {
        irradiance = probeIrradiance;
    }
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
