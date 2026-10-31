    vec4 ambient = vec4(0.0);
    vec4 emission = material_EmissiveColor;
    vec4 diffuse = material_BaseColor;
    vec4 specular = material_SpecularColor;

    

    #ifdef MATERIAL_HAS_EMISSIVETEXTURE
        emission *= texture2DSRGB(material_EmissiveTexture, v_uv, material_EmissiveTexture_SRGBDecode);
    #endif

    #ifdef MATERIAL_HAS_BASETEXTURE
        diffuse *= texture2DSRGB(material_BaseTexture, v_uv, material_BaseTexture_SRGBDecode);
    #endif

     #ifdef RENDERER_ENABLE_VERTEXCOLOR
        diffuse *= v_color;
    #endif

    #ifdef MATERIAL_HAS_SPECULAR_TEXTURE
        specular *= texture2DSRGB(material_SpecularTexture, v_uv, material_SpecularTexture_SRGBDecode);
    #endif

    ambient = vec4(scene_EnvMapLight.diffuse * scene_EnvMapLight.diffuseIntensity, 1.0) * diffuse;