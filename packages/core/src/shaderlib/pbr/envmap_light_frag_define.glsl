struct EnvMapLight {
    vec3 diffuse;
    float mipMapLevel;
    float diffuseIntensity;
    float specularIntensity;
    mat4 transformMatrix;
};


uniform EnvMapLight u_envMapLight;

#ifdef O3_USE_DIFFUSE_ENV
    uniform vec3 u_env_sh[9];
#endif

#ifdef O3_USE_SPECULAR_ENV
    uniform samplerCube u_env_specularSampler;
#endif
