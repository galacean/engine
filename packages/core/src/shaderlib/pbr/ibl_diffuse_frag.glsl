#if defined(RE_IndirectDiffuse)

    vec3 irradiance = vec3(0);

    #if defined(O3_HAS_AMBIENT_LIGHT)
        irradiance += getAmbientLightIrradiance(u_ambientLightColor);
    #endif

    #if defined(O3_HAS_ENVMAP_LIGHT)

        #ifdef O3_USE_DIFFUSE_ENV
            vec3 lightMapIrradiance = textureCube(u_env_diffuseSampler, geometry.normal).rgb * u_envMapLight.diffuseIntensity;
        #else
            vec3 lightMapIrradiance = u_envMapLight.diffuse * u_envMapLight.diffuseIntensity;
        #endif

        #ifndef PHYSICALLY_CORRECT_LIGHTS
            lightMapIrradiance *= PI;
        #endif

        irradiance += lightMapIrradiance;

    #endif

    RE_IndirectDiffuse( irradiance, geometry, material, reflectedLight );

#endif


