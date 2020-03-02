#ifdef O3_HAS_ENVMAP_LIGHT

struct EnvMapLight {

    #ifdef O3_USE_DIFFUSE_ENV
    samplerCube diffuseSampler;
    #endif

    #ifdef O3_USE_SPECULAR_ENV
    samplerCube specularSampler;
    #endif

    vec3 diffuse;
    vec3 specular;
    float mipMapLevel;
    float diffuseIntensity;
    float specularIntensity;
};

uniform EnvMapLight u_envMapLight;

#endif
