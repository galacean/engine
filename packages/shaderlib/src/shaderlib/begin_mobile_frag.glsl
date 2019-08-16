    #ifdef R3_EMISSION_TEXTURE

    vec4 emission = texture2D(u_emission, v_uv);

    #else

    vec4 emission = u_emission;

    #endif

    #ifdef R3_AMBIENT_TEXTURE

    vec4 ambient = texture2D(u_ambient, v_uv) * u_ambientLight;

    #else

    vec4 ambient = u_ambient * u_ambientLight;

    #endif

    #ifdef R3_DIFFUSE_TEXTURE

    vec4 diffuse = texture2D(u_diffuse, v_uv);

    #else

    vec4 diffuse = u_diffuse;

    #endif

    #ifdef R3_SPECULAR_TEXTURE

    vec4 specular = texture2D(u_specular, v_uv);

    #else

    vec4 specular = u_specular;

    #endif
