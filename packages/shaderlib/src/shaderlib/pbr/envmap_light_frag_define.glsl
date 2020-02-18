#ifdef O3_HAS_ENVMAP_LIGHT

struct EnvMapLight {

    #ifdef O3_HAS_DIFFUSEMAP
    samplerCube diffuseSampler;
    #endif

    #ifdef O3_HAS_SPECULARMAP
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
