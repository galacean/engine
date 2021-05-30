    vec3 normal = getNormal();
    vec4 diffuseColor = u_baseColorFactor;
    vec3 totalEmissiveRadiance = u_emissiveFactor;
    float metalnessFactor = u_metal;
    float roughnessFactor = u_roughness;
    vec3 specularFactor = u_specularFactor;
    float glossinessFactor = u_glossinessFactor;

    ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
    PhysicalMaterial material;
    GeometricContext geometry;
    IncidentLight directLight;

    #ifdef HAS_BASECOLORMAP

        vec4 baseMapColor = texture2D( u_baseColorSampler, v_uv );
        baseMapColor = SRGBtoLinear( baseMapColor );
        diffuseColor *= baseMapColor;

    #endif

    #ifdef O3_HAS_VERTEXCOLOR

        diffuseColor.rgb *= v_color.rgb;

        #ifdef O3_HAS_VERTEXALPHA

            diffuseColor.a *= v_color.a;

        #endif

    #endif


    #if defined(ALPHA_BLEND) && defined(HAS_OPACITYMAP)

        #ifdef GETOPACITYFROMRGB
            diffuseColor.a *= getLuminance(texture2D( u_opacitySampler, v_uv ).rgb);
        #else
            diffuseColor.a *= texture2D( u_opacitySampler, v_uv ).a;
        #endif

    #endif

    #ifdef ALPHA_CUTOFF

        if( diffuseColor.a < u_alphaCutoff ) {
            discard;
        }

    #endif

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
            material.specularColor = mix( vec3( DEFAULT_SPECULAR_COEFFICIENT ), diffuseColor.rgb, metalnessFactor );
            material.specularRoughness = clamp( roughnessFactor, 0.005, 1.0 );
        #else
            float specularStrength = max( max( specularFactor.r, specularFactor.g ), specularFactor.b );
            material.diffuseColor = diffuseColor.rgb * ( 1.0 - specularStrength );
            material.specularColor = specularFactor;
            material.specularRoughness = clamp( 1.0 - glossinessFactor, 0.005, 1.0 );
        #endif
        
        material.specularRoughness += getAARoughnessFactor(normal);
        material.specularRoughness = min( material.specularRoughness, 1.0 );

        geometry.position = v_pos;
        geometry.normal = normal;
        geometry.viewDir = normalize( u_cameraPos - v_pos );
