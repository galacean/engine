Geometry geometry;
Material material;
ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );

initGeometry(geometry);
initMaterial(material, geometry);

// Direct Light
addTotalDirectRadiance(geometry, material, reflectedLight);

// IBL 
evaluateIBL(reflectedLight, geometry, material);


// Occlusion
#ifdef OCCLUSIONTEXTURE
    vec2 aoUV = v_uv;
    #ifdef O3_HAS_UV1
        if(u_occlusionTextureCoord == 1.0){
            aoUV = v_uv1;
        }
    #endif
    float ambientOcclusion = (texture2D(u_occlusionTexture, aoUV).r - 1.0) * u_occlusionIntensity + 1.0;
    reflectedLight.indirectDiffuse *= ambientOcclusion;
    #ifdef O3_USE_SPECULAR_ENV
        reflectedLight.indirectSpecular *= computeSpecularOcclusion(ambientOcclusion, material.roughness, geometry.dotNV);
    #endif
#endif


// Emissive
vec3 emissiveRadiance = u_emissiveColor;
#ifdef EMISSIVETEXTURE
    vec4 emissiveColor = texture2D(u_emissiveTexture, v_uv);
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
gl_FragColor = targetColor;
