    vec4 ambient = vec4(0.0);
    vec4 emission = u_emissiveColor;
    vec4 diffuse = u_diffuseColor;
    vec4 specular = u_specularColor;
      
    #ifdef O3_HAS_AMBIENT_LIGHT
        ambient += vec4(u_ambientLightColor, 1.0);
    #endif

    #ifdef O3_EMISSIVE_TEXTURE

        emission *= texture2D(u_emissiveTexture, v_uv);

    #endif

    #ifdef O3_DIFFUSE_TEXTURE

        diffuse *= texture2D(u_diffuseTexture, v_uv);

    #endif

    #ifdef O3_SPECULAR_TEXTURE

        specular *= texture2D(u_specularTexture, v_uv);

    #endif
