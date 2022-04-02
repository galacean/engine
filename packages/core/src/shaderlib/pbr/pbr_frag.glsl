Geometry geometry;
Material material;
ReflectedLight reflectedLight;

initGeometry(geometry);
initMaterial(material, geometry);

// Direct Light
addTotalDirectRadiance(geometry, material, reflectedLight);

// IBL diffuse
#ifdef O3_USE_SH
    vec3 irradiance = getLightProbeIrradiance(u_env_sh, geometry.normal);
    #ifdef OASIS_COLORSPACE_GAMMA
        irradiance = linearToGamma(vec4(irradiance, 1.0)).rgb;
    #endif
    irradiance *= u_envMapLight.diffuseIntensity;
#else
   vec3 irradiance = u_envMapLight.diffuse * u_envMapLight.diffuseIntensity;
   irradiance *= PI;
#endif

reflectedLight.indirectDiffuse += irradiance * BRDF_Diffuse_Lambert( material.diffuseColor );

// IBL specular
vec3 radiance = getLightProbeRadiance(geometry.viewDir, geometry.normal, material.roughness, int(u_envMapLight.mipMapLevel), u_envMapLight.specularIntensity);
float radianceAttenuation = 1.0;

#ifdef CLEARCOAT
    vec3 clearcoatRadiance = getLightProbeRadiance( geometry.viewDir, geometry.clearcoatNormal, material.clearcoatRoughness, int(u_envMapLight.mipMapLevel), u_envMapLight.specularIntensity );

    reflectedLight.indirectSpecular += clearcoatRadiance * material.clearcoat * envBRDFApprox(vec3( 0.04 ), material.clearcoatRoughness, geometry.clearcoatDotNV);
    radianceAttenuation -= material.clearcoat * F_Schlick(geometry.clearcoatDotNV);
#endif

reflectedLight.indirectSpecular += radianceAttenuation * radiance * envBRDFApprox(material.specularColor, material.roughness, geometry.dotNV );


// Occlusion
#ifdef HAS_OCCLUSIONMAP
    float ambientOcclusion = (texture2D(u_occlusionSampler, geometry.uv).r - 1.0) * u_occlusionStrength + 1.0;
    reflectedLight.indirectDiffuse *= ambientOcclusion;
    #ifdef O3_USE_SPECULAR_ENV
        reflectedLight.indirectSpecular *= computeSpecularOcclusion(ambientOcclusion, material.roughness, geometry.dotNV);
    #endif
#endif

// Emissive
vec3 emissiveRadiance = u_emissiveColor;
#ifdef HAS_EMISSIVEMAP
    vec4 emissiveColor = texture2D(u_emissiveSampler, geometry.uv);
    #ifndef OASIS_COLORSPACE_GAMMA
        emissiveColor = gammaToLinear(emissiveColor);
    #endif
    emissiveRadiance *= emissiveColor.rgb;
#endif

// Total
vec3 totalRadiance =    reflectedLight.directDiffuse + 
                        reflectedLight.indirectDiffuse + 
                        reflectedLight.directSpecular + 
                        reflectedLight.indirectSpecular + 
                        emissiveRadiance;

vec4 targetColor =vec4(totalRadiance, material.opacity);
#ifndef OASIS_COLORSPACE_GAMMA
    targetColor = linearToGamma(targetColor);
#endif
gl_FragColor = targetColor;
