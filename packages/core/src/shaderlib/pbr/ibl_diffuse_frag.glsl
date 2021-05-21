vec3 irradiance = vec3(0);
    
#ifdef O3_USE_DIFFUSE_ENV
    vec3 lightMapIrradiance = getLightProbeIrradiance(u_env_sh, normal) * u_envMapLight.diffuseIntensity;
#else
    vec3 lightMapIrradiance = u_envMapLight.diffuse * u_envMapLight.diffuseIntensity;
#endif

irradiance += lightMapIrradiance;

RE_IndirectDiffuse_Physical( irradiance, geometry, material, reflectedLight );

