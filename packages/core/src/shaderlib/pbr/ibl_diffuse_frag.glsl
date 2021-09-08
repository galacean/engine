#ifdef O3_USE_SH
   vec3 irradiance = getLightProbeIrradiance(u_env_sh, normal) * u_envMapLight.diffuseIntensity;
#else
   vec3 irradiance = u_envMapLight.diffuse * u_envMapLight.diffuseIntensity;
#endif

#ifndef PHYSICALLY_CORRECT_LIGHTS
   irradiance *= PI;
#endif

RE_IndirectDiffuse_Physical( irradiance, geometry, material, reflectedLight );


