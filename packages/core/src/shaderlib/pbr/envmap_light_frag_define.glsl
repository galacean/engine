struct EnvMapLight {
    vec3 diffuse;
    vec3 specular;
    float mipMapLevel;
    float diffuseIntensity;
    float specularIntensity;
    mat4 transformMatrix;
};


uniform EnvMapLight u_envMapLight;

#ifdef O3_USE_DIFFUSE_ENV
    uniform samplerCube u_env_diffuseSampler;
#endif

#ifdef O3_USE_SPECULAR_ENV
    uniform samplerCube u_env_specularSampler;
#endif
