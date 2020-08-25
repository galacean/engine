#ifdef O3_HAS_ENVMAP_LIGHT

struct EnvMapLight {
    vec3 diffuse;
    vec3 specular;
    float mipMapLevel;
    float diffuseIntensity;
    float specularIntensity;
    mat3 transformMatrix;
};


uniform EnvMapLight u_envMapLight;

#ifdef O3_USE_DIFFUSE_ENV
    uniform samplerCube u_env_diffuseSampler;
#endif

#ifdef O3_USE_SPECULAR_ENV
    uniform samplerCube u_env_specularSampler;
#endif

#endif
