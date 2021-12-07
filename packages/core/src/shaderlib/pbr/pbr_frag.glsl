GeometricContext geometry = GeometricContext(v_pos, getNormal(), normalize(u_cameraPos - v_pos));
PhysicalMaterial material = getPhysicalMaterial(u_baseColor, u_metal, u_roughness, u_specularColor, u_glossiness, u_alphaCutoff);
ReflectedLight reflectedLight = ReflectedLight( vec3( 0 ), vec3( 0 ), vec3( 0 ), vec3( 0 ) );
float dotNV = saturate( dot( geometry.normal, geometry.viewDir ) );

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
vec3 radiance = getLightProbeRadiance( geometry, material.roughness, int(u_envMapLight.mipMapLevel), u_envMapLight.specularIntensity);
reflectedLight.indirectSpecular += radiance * envBRDFApprox(material.specularColor, material.roughness, dotNV );

// Occlusion
#ifdef HAS_OCCLUSIONMAP
    float ambientOcclusion = (texture2D(u_occlusionSampler, v_uv).r - 1.0) * u_occlusionStrength + 1.0;
    reflectedLight.indirectDiffuse *= ambientOcclusion;
    #ifdef O3_USE_SPECULAR_ENV
        reflectedLight.indirectSpecular *= computeSpecularOcclusion(ambientOcclusion, material.roughness, dotNV);
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
