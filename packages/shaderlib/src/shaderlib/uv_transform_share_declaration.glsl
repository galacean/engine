#ifdef HAS_SPECULARGLOSSINESSMAP

    varying vec2 v_uv_specularGlossinessTexture;

#endif

#ifdef HAS_BASECOLORMAP

    varying vec2 v_uv_baseColorTexture;

#endif

#ifdef O3_HAS_NORMALMAP

    varying vec2 v_uv_normalTexture;

#endif

#ifdef HAS_EMISSIVEMAP

    varying vec2 v_uv_emissiveTexture;

#endif

#ifdef HAS_METALROUGHNESSMAP

    varying vec2 v_uv_metallicRoughnessTexture;

#endif

#ifdef HAS_OCCLUSIONMAP

    varying vec2 v_uv_occlusionTexture;

#endif

#ifdef HAS_OPACITYMAP

    varying vec2 v_uv_opacityTexture;

#endif

#ifdef HAS_PERTURBATIONMAP

    varying vec2 v_uv_perturbationTexture;

#endif


// mobile material,以后需要重构成统一的变量
#ifdef O3_EMISSION_TEXTURE

    varying vec2 v_uv_emissionTexture;

#endif

#ifdef O3_AMBIENT_TEXTURE

    varying vec2 v_uv_ambientTexture;

#endif

#ifdef O3_DIFFUSE_TEXTURE

    varying vec2 v_uv_diffuseTexture;

#endif

#ifdef O3_SPECULAR_TEXTURE

    varying vec2 v_uv_specularTexture;

#endif
