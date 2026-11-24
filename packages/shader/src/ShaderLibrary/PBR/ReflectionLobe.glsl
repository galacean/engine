#ifndef REFLECTION_LOBE_INCLUDED
#define REFLECTION_LOBE_INCLUDED

void diffuseLobe(Varyings varyings, SurfaceData surfaceData, BSDFData bsdfData, vec3 attenuationIrradiance, inout vec3 diffuseColor){
    diffuseColor += attenuationIrradiance * BRDF_Diffuse_Lambert( bsdfData.diffuseColor );
}

void specularLobe(Varyings varyings, SurfaceData surfaceData, BSDFData bsdfData, vec3 incidentDirection, vec3 attenuationIrradiance, inout vec3 specularColor){
    vec3 halfDir = normalize(incidentDirection + surfaceData.viewDir);
    float dotLH = saturate(dot(incidentDirection, halfDir));
    vec3 fresnel = F_Schlick(bsdfData.specularF0, bsdfData.specularF90, dotLH);
    #ifdef MATERIAL_ENABLE_IRIDESCENCE
        fresnel = mix(fresnel, bsdfData.iridescenceSpecularColor, surfaceData.iridescenceFactor);
    #endif

    #ifdef MATERIAL_ENABLE_ANISOTROPY
        vec3 specular = BRDF_Specular_GGX_Anisotropic(incidentDirection, halfDir, surfaceData, fresnel, bsdfData.roughness);
    #else
        vec3 specular = BRDF_Specular_GGX(incidentDirection, halfDir, surfaceData.viewDir, surfaceData.normal, fresnel, bsdfData.roughness);
    #endif
    specularColor += attenuationIrradiance * specular * bsdfData.energyCompensation;
}

void sheenLobe(Varyings varyings, SurfaceData surfaceData, BSDFData bsdfData, vec3 incidentDirection, vec3 attenuationIrradiance, inout vec3 diffuseColor, inout vec3 specularColor){
    #ifdef MATERIAL_ENABLE_SHEEN
        diffuseColor *= bsdfData.sheenScaling;
        specularColor *= bsdfData.sheenScaling;

        specularColor += attenuationIrradiance * sheenBRDF(incidentDirection, surfaceData, surfaceData.sheenColor, bsdfData.sheenRoughness);
    #endif
}

float clearCoatLobe(Varyings varyings, SurfaceData surfaceData, BSDFData bsdfData, vec3 incidentDirection, vec3 color, inout vec3 specularColor){
    float attenuation = 1.0;

    #ifdef MATERIAL_ENABLE_CLEAR_COAT
        float clearCoatDotNL = saturate( dot( surfaceData.clearCoatNormal, incidentDirection ) );
        vec3 clearCoatIrradiance = clearCoatDotNL * color;

        vec3 halfDir = normalize(incidentDirection + surfaceData.viewDir);
        float dotLH = saturate(dot(incidentDirection, halfDir));
        vec3 fresnel = F_Schlick(bsdfData.clearCoatSpecularColor, 1.0, dotLH);
        specularColor += surfaceData.clearCoat * clearCoatIrradiance * BRDF_Specular_GGX(incidentDirection, halfDir, surfaceData.viewDir, surfaceData.clearCoatNormal, fresnel, bsdfData.clearCoatRoughness);
        attenuation -= surfaceData.clearCoat * F_Schlick(0.04, 1.0, surfaceData.clearCoatDotNV);
    #endif

    return attenuation;
}

#endif
