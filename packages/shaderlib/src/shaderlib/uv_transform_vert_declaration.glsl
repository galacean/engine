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
