Geometry geometry;
Material material;
ReflectedLight reflectedLight;

initGeometry(geometry);
initMaterial(material);

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
vec3 clearcoatRadiance = vec3(0);

#ifdef CLEARCOAT
     clearcoatRadiance = getLightProbeRadiance( geometry.viewDir, geometry.clearcoatNormal, material.clearcoatRoughness, int(u_envMapLight.mipMapLevel), u_envMapLight.specularIntensity );
#endif

#ifdef CLEARCOAT
    float ccDotNV = saturate( dot( geometry.clearcoatNormal, geometry.viewDir ) );
    reflectedLight.indirectSpecular += clearcoatRadiance * material.clearcoat * envBRDFApprox(vec3( 0.04 ), material.clearcoatRoughness, geometry.dotNV);
    float ccDotNL = ccDotNV;
    float clearcoatDHR = material.clearcoat * clearcoatDHRApprox( material.clearcoatRoughness, ccDotNL );
#else
    float clearcoatDHR = 0.0;
#endif

float clearcoatInv = 1.0 - clearcoatDHR;
reflectedLight.indirectSpecular += clearcoatInv * radiance * envBRDFApprox(material.specularColor, material.roughness, geometry.dotNV );


// Occlusion
#ifdef HAS_OCCLUSIONMAP
    float ambientOcclusion = (texture2D(u_occlusionSampler, v_uv).r - 1.0) * u_occlusionStrength + 1.0;
    reflectedLight.indirectDiffuse *= ambientOcclusion;
    #ifdef O3_USE_SPECULAR_ENV
        reflectedLight.indirectSpecular *= computeSpecularOcclusion(ambientOcclusion, material.roughness, geometry.dotNV);
    #endif
#endif

// Emissive
vec3 emissiveRadiance = u_emissiveColor;
#ifdef HAS_EMISSIVEMAP
    vec4 emissiveColor = texture2D(u_emissiveSampler, v_uv);
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
