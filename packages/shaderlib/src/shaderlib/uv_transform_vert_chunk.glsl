#ifdef HAS_SPECULARGLOSSINESSMAP

    v_uv_specularGlossinessTexture = (u_specularGlossinessSamplerMatrix * vec3(v_uv, 1.0)).st ;

#endif

#ifdef HAS_BASECOLORMAP

    v_uv_baseColorTexture = (u_baseColorSamplerMatrix * vec3(v_uv, 1.0)).st ;

#endif

#ifdef O3_HAS_NORMALMAP

    v_uv_normalTexture = (u_normalSamplerMatrix * vec3(v_uv, 1.0)).st ;

#endif

#ifdef HAS_EMISSIVEMAP

    v_uv_emissiveTexture = (u_emissiveSamplerMatrix * vec3(v_uv, 1.0)).st ;

#endif

#ifdef HAS_METALROUGHNESSMAP

    v_uv_metallicRoughnessTexture = (u_metallicRoughnessSamplerMatrix * vec3(v_uv, 1.0)).st ;

#endif

#ifdef HAS_OCCLUSIONMAP

    v_uv_occlusionTexture = (u_occlusionSamplerMatrix * vec3(v_uv, 1.0)).st ;

#endif

#ifdef HAS_OPACITYMAP

    v_uv_opacityTexture = (u_opacitySamplerMatrix * vec3(v_uv, 1.0)).st ;

#endif

#ifdef HAS_PERTURBATIONMAP

    v_uv_perturbationTexture = (u_perturbationSamplerMatrix * vec3(v_uv, 1.0)).st ;

#endif
