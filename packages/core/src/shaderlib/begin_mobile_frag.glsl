    vec4 ambient = vec4(0.0);
    vec4 emission = material_EmissiveColor;
    vec4 diffuse = material_BaseColor;
    vec4 specular = material_SpecularColor;

    

    #ifdef MATERIAL_HAS_EMISSIVETEXTURE
        vec4 emissiveTextureColor = texture2D(material_EmissiveTexture, v_uv);
        emissiveTextureColor = gammaToLinear(emissiveTextureColor);
        emission *= emissiveTextureColor;

    #endif

    #ifdef MATERIAL_HAS_BASETEXTURE
        vec4 diffuseTextureColor = texture2D(material_BaseTexture, v_uv);
        diffuseTextureColor = gammaToLinear(diffuseTextureColor);
        diffuse *= diffuseTextureColor;

    #endif

     #ifdef RENDERER_ENABLE_VERTEXCOLOR

        diffuse *= v_color;

    #endif

    #ifdef MATERIAL_HAS_SPECULAR_TEXTURE
        vec4 specularTextureColor = texture2D(material_SpecularTexture, v_uv);
        specularTextureColor = gammaToLinear(specularTextureColor);
        specular *= specularTextureColor;

    #endif

    ambient = vec4(scene_EnvMapLight.diffuse * scene_EnvMapLight.diffuseIntensity, 1.0) * diffuse;