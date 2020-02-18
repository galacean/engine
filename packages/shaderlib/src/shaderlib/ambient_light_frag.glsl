#ifdef O3_HAS_AMBIENT_LIGHT

struct AmbientLight {
    vec3 color;
    vec3 lightColor;
    float intensity;
};
uniform AmbientLight u_ambientLight;

#endif
