#ifdef RE_IndirectDiffuse

    vec3 irradiance = vec3(0);

    #if defined(O3_HAS_ENVMAP_LIGHT) && defined(O3_USE_DIFFUSE_ENV)
        irradiance += getLightProbeIrradiance(u_env_sh, normal) * u_envMapLight.diffuseIntensity;;
    #elif defined(O3_HAS_AMBIENT_LIGHT)
        irradiance += getAmbientLightIrradiance(u_ambientLightColor);
    #endif

    RE_IndirectDiffuse( irradiance, geometry, material, reflectedLight );

#endif


