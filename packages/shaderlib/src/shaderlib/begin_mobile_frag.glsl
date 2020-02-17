    #ifdef O3_EMISSION_TEXTURE

    vec4 emission = texture2D(u_emission, v_uv_emissionTexture);

    #else

    vec4 emission = u_emission;

    #endif

    vec4 ambient = vec4(0);
    #ifdef O3_HAS_AMBIENTLIGHT
        #ifdef O3_AMBIENT_TEXTURE
            ambient = texture2D(u_ambient, v_uv_ambientTexture) * vec4(u_ambientLight.lightColor, 1.0);
         #else
            ambient = u_ambient * vec4(u_ambientLight.lightColor, 1.0);
         #endif
    #endif

    #ifdef O3_DIFFUSE_TEXTURE

    vec4 diffuse = texture2D(u_diffuse, v_uv_diffuseTexture);

    #else

    vec4 diffuse = u_diffuse;

    #endif

    #ifdef O3_SPECULAR_TEXTURE

    vec4 specular = texture2D(u_specular, v_uv_specularTexture);

    #else

    vec4 specular = u_specular;

    #endif
