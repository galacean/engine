Geometry geometry;
Material material;
ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );

initGeometry(geometry);
initMaterial(material, geometry);

// Direct Light
addTotalDirectRadiance(geometry, material, reflectedLight);

// IBL diffuse
#ifdef GALACEAN_USE_SH
    vec3 irradiance = getLightProbeIrradiance(galacean_EnvSH, geometry.normal);
    #ifdef GALACEAN_COLORSPACE_GAMMA
        irradiance = linearToGamma(vec4(irradiance, 1.0)).rgb;
    #endif
    irradiance *= galacean_EnvMapLight.diffuseIntensity;
#else
   vec3 irradiance = galacean_EnvMapLight.diffuse * galacean_EnvMapLight.diffuseIntensity;
   irradiance *= PI;
#endif

reflectedLight.indirectDiffuse += irradiance * BRDF_Diffuse_Lambert( material.diffuseColor );

// IBL specular
vec3 radiance = getLightProbeRadiance(geometry.viewDir, geometry.normal, material.roughness, int(galacean_EnvMapLight.mipMapLevel), galacean_EnvMapLight.specularIntensity);
float radianceAttenuation = 1.0;

#ifdef CLEARCOAT
    vec3 clearCoatRadiance = getLightProbeRadiance( geometry.viewDir, geometry.clearCoatNormal, material.clearCoatRoughness, int(galacean_EnvMapLight.mipMapLevel), galacean_EnvMapLight.specularIntensity );

    reflectedLight.indirectSpecular += clearCoatRadiance * material.clearCoat * envBRDFApprox(vec3( 0.04 ), material.clearCoatRoughness, geometry.clearCoatDotNV);
    radianceAttenuation -= material.clearCoat * F_Schlick(geometry.clearCoatDotNV);
#endif

reflectedLight.indirectSpecular += radianceAttenuation * radiance * envBRDFApprox(material.specularColor, material.roughness, geometry.dotNV );


// Occlusion
#ifdef OCCLUSIONTEXTURE
    vec2 aoUV = v_uv;
    #ifdef GALACEAN_HAS_UV1
        if(u_occlusionTextureCoord == 1.0){
            aoUV = v_uv1;
        }
    #endif
    float ambientOcclusion = (texture2D(u_occlusionTexture, aoUV).r - 1.0) * u_occlusionIntensity + 1.0;
    reflectedLight.indirectDiffuse *= ambientOcclusion;
    #ifdef GALACEAN_USE_SPECULAR_ENV
        reflectedLight.indirectSpecular *= computeSpecularOcclusion(ambientOcclusion, material.roughness, geometry.dotNV);
    #endif
#endif


// Emissive
vec3 emissiveRadiance = u_emissiveColor;
#ifdef EMISSIVETEXTURE
    vec4 emissiveColor = texture2D(u_emissiveTexture, v_uv);
    #ifndef GALACEAN_COLORSPACE_GAMMA
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
