    vec4 ambient = u_ambientColor;
    vec4 emission = u_emissiveColor;
    vec4 diffuse = u_diffuseColor;
    vec4 specular = u_specularColor;
      
     #ifdef O3_HAS_AMBIENT_LIGHT
        ambient *= vec4(u_ambientLightColor, 1.0);
        #ifdef O3_AMBIENT_TEXTURE
            ambient *= texture2D(u_ambientTexture, v_uv);
         #endif
    #endif

    #ifdef O3_EMISSIVE_TEXTURE

        emission *= texture2D(u_emissiveTexture, v_uv);

    #else

    #endif

    #ifdef O3_DIFFUSE_TEXTURE

    diffuse *= texture2D(u_diffuseTexture, v_uv);

    #endif

    #ifdef O3_SPECULAR_TEXTURE

    specular *= texture2D(u_specularTexture, v_uv);

    #endif
