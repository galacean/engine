    vec4 ambient = vec4(0.0);
    vec4 emission = u_emissiveColor;
    vec4 diffuse = u_baseColor;
    vec4 specular = u_specularColor;

    

    #ifdef EMISSIVETEXTURE
        vec4 emissiveTextureColor = texture2D(u_emissiveTexture, v_uv);
        #ifndef OASIS_COLORSPACE_GAMMA
            emissiveTextureColor = gammaToLinear(emissiveTextureColor);
        #endif
        emission *= emissiveTextureColor;

    #endif

    #ifdef BASETEXTURE
        vec4 diffuseTextureColor = texture2D(u_baseTexture, v_uv);
        #ifndef OASIS_COLORSPACE_GAMMA
            diffuseTextureColor = gammaToLinear(diffuseTextureColor);
        #endif
        diffuse *= diffuseTextureColor;

    #endif

     #ifdef MATERIAL_ENABLE_VERTEX_COLOR

        diffuse *= v_color;

    #endif

    #ifdef O3_SPECULAR_TEXTURE
        vec4 specularTextureColor = texture2D(u_specularTexture, v_uv);
        #ifndef OASIS_COLORSPACE_GAMMA
            specularTextureColor = gammaToLinear(specularTextureColor);
        #endif
        specular *= specularTextureColor;

    #endif

    ambient = vec4(u_envMapLight.diffuse * u_envMapLight.diffuseIntensity, 1.0) * diffuse;