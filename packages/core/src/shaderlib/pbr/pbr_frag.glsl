Geometry geometry;
Material material;
ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );

initGeometry(geometry, gl_FrontFacing);
initMaterial(material, geometry);

// Direct Light
addTotalDirectRadiance(geometry, material, reflectedLight);

// IBL diffuse
#ifdef SCENE_USE_SH
    vec3 irradiance = getLightProbeIrradiance(scene_EnvSH, geometry.normal);
    #ifdef ENGINE_IS_COLORSPACE_GAMMA
        irradiance = linearToGamma(vec4(irradiance, 1.0)).rgb;
    #endif
    irradiance *= scene_EnvMapLight.diffuseIntensity;
#else
   vec3 irradiance = scene_EnvMapLight.diffuse * scene_EnvMapLight.diffuseIntensity;
   irradiance *= PI;
#endif

reflectedLight.indirectDiffuse += material.diffuseAO * irradiance * BRDF_Diffuse_Lambert( material.diffuseColor );

// IBL specular
vec3 radiance = getLightProbeRadiance(geometry, geometry.normal, material.roughness, int(scene_EnvMapLight.mipMapLevel), scene_EnvMapLight.specularIntensity);
float radianceAttenuation = 1.0;

// IBL Clear Coat
#ifdef MATERIAL_ENABLE_CLEAR_COAT
    vec3 clearCoatRadiance = getLightProbeRadiance( geometry, geometry.clearCoatNormal, material.clearCoatRoughness, int(scene_EnvMapLight.mipMapLevel), scene_EnvMapLight.specularIntensity );

    reflectedLight.indirectSpecular += material.specularAO * clearCoatRadiance * material.clearCoat * envBRDFApprox(vec3( 0.04 ), material.clearCoatRoughness, geometry.clearCoatDotNV);
    radianceAttenuation -= material.clearCoat * F_Schlick(material.f0, geometry.clearCoatDotNV);
#endif

#ifdef MATERIAL_ENABLE_IRIDESCENCE
    vec3 speculaColor = mix(material.specularColor, material.iridescenceSpecularColor, material.iridescenceFactor);
#else
    vec3 speculaColor = material.specularColor;
#endif

reflectedLight.indirectSpecular += material.specularAO * radianceAttenuation * radiance * envBRDFApprox(speculaColor, material.roughness, geometry.dotNV);


// IBL Sheen
evaluateSheenIBL(geometry, material, radianceAttenuation, reflectedLight.indirectDiffuse, reflectedLight.indirectSpecular);

// Emissive
vec3 emissiveRadiance = material_EmissiveColor;
#ifdef MATERIAL_HAS_EMISSIVETEXTURE
    vec4 emissiveColor = texture2D(material_EmissiveTexture, v_uv);
    #ifndef ENGINE_IS_COLORSPACE_GAMMA
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
gl_FragColor = targetColor;
