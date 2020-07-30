    vec3 normal = getNormal();
    vec4 diffuseColor = u_baseColorFactor;
    vec3 totalEmissiveRadiance = vec3(0.0);
    float metalnessFactor = u_metallicRoughnessValue.r;
    float roughnessFactor = u_metallicRoughnessValue.g;
    vec3 specularFactor = u_specularFactor;
    float glossinessFactor = u_glossinessFactor;

    ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
    PhysicalMaterial material;
    GeometricContext geometry;
    IncidentLight directLight;

    #ifdef HAS_BASECOLORMAP

        vec4 baseMapColor = texture2D( u_baseColorSampler, v_uv );
        baseMapColor = SRGBtoLINEAR( baseMapColor );
        diffuseColor *= baseMapColor;

    #endif

    #ifdef O3_HAS_VERTEXCOLOR

        diffuseColor.rgb *= v_color.rgb;

        #ifdef O3_HAS_VERTEXALPHA

            diffuseColor.a *= v_color.a;

        #endif

    #endif

    #ifdef ALPHA_MASK

        if( diffuseColor.a < u_alphaCutoff ) {
            discard;
        }

    #endif


    #if defined(ALPHA_BLEND) && defined(HAS_OPACITYMAP)

        #ifdef GETOPACITYFROMRGB
            diffuseColor.a *= getLuminance(texture2D( u_opacitySampler, v_opacityTexture ).rgb);
        #else
            diffuseColor.a *= texture2D( u_opacitySampler, v_opacityTexture ).a;
        #endif

    #endif

    #ifdef UNLIT

        gl_FragColor = vec4( diffuseColor.rgb, diffuseColor.a );

    #else



        #ifdef HAS_METALROUGHNESSMAP

            vec4 metalRoughMapColor = texture2D( u_metallicRoughnessSampler, v_uv );
            metalnessFactor *= metalRoughMapColor.b;
            roughnessFactor *= metalRoughMapColor.g;

        #else
            #ifdef HAS_METALMAP

            vec4 metalMapColor = texture2D( u_metallicSampler, v_uv );
            metalnessFactor *= metalMapColor.b;

            #endif

            #ifdef HAS_ROUGHNESSMAP

            vec4 roughMapColor = texture2D( u_roughnessSampler, v_uv );
            roughnessFactor *= roughMapColor.g;

            #endif
        #endif

        #ifdef HAS_SPECULARGLOSSINESSMAP

            vec4 specularGlossinessColor = texture2D(u_specularGlossinessSampler, v_uv );
            specularFactor *= specularGlossinessColor.rgb;
            glossinessFactor *= specularGlossinessColor.a;

        #endif


        #ifdef IS_METALLIC_WORKFLOW
            material.diffuseColor = diffuseColor.rgb * ( 1.0 - metalnessFactor );
            material.specularRoughness = clamp( roughnessFactor, 0.04, 1.0 );
//          material.specularColor = mix( vec3( DEFAULT_SPECULAR_COEFFICIENT ), diffuseColor.rgb, metalnessFactor );
            material.specularColor = mix( vec3( MAXIMUM_SPECULAR_COEFFICIENT /* pow2( reflectivity )*/ ), diffuseColor.rgb, metalnessFactor );
        #else
            float specularStrength = max( max( specularFactor.r, specularFactor.g ), specularFactor.b );
            material.diffuseColor = diffuseColor.rgb * ( 1.0 - specularStrength );
            material.specularRoughness = clamp( 1.0 - glossinessFactor, 0.04, 1.0 );
            material.specularColor = specularFactor;
        #endif

        material.clearCoat = saturate( u_clearCoat );
        material.clearCoatRoughness = clamp( u_clearCoatRoughness, 0.04, 1.0 );

        geometry.position = v_pos;
        geometry.normal = normal;
        geometry.viewDir = normalize( u_cameraPos - v_pos );

