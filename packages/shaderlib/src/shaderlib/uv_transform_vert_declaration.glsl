#ifdef HAS_SPECULARGLOSSINESSMAP

    uniform mat3 u_specularGlossinessSamplerMatrix;

#endif

#ifdef HAS_BASECOLORMAP

    uniform mat3 u_baseColorSamplerMatrix;

#endif

#ifdef O3_HAS_NORMALMAP

    uniform mat3 u_normalSamplerMatrix;

#endif

#ifdef HAS_EMISSIVEMAP

    uniform mat3 u_emissiveSamplerMatrix;

#endif

#ifdef HAS_METALMAP

    uniform mat3 u_metallicSamplerMatrix;

#endif

#ifdef HAS_ROUGHNESSMAP

    uniform mat3 u_roughnessSamplerMatrix;

#endif

#ifdef HAS_METALROUGHNESSMAP

    uniform mat3 u_metallicRoughnessSamplerMatrix;

#endif

#ifdef HAS_OCCLUSIONMAP

    uniform mat3 u_occlusionSamplerMatrix;

#endif

#ifdef HAS_OPACITYMAP

    uniform mat3 u_opacitySamplerMatrix;

#endif

#ifdef HAS_PERTURBATIONMAP

    uniform mat3 u_perturbationSamplerMatrix;

#endif


// mobile material,以后需要重构成统一的变量
#ifdef O3_EMISSION_TEXTURE

    uniform mat3 u_emissionMatrix;

#endif

#ifdef O3_AMBIENT_TEXTURE

    uniform mat3 u_ambientMatrix;

#endif

#ifdef O3_DIFFUSE_TEXTURE

    uniform mat3 u_diffuseMatrix;

#endif

#ifdef O3_SPECULAR_TEXTURE

    uniform mat3 u_specularMatrix;

#endif
