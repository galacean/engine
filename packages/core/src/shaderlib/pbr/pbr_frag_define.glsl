uniform float u_alphaCutoff;

uniform vec4 u_baseColor;
uniform float u_metal;
uniform float u_roughness;
uniform vec3 u_specularColor;
uniform float u_glossiness;
uniform vec3 u_emissiveColor;

uniform float u_normalIntensity;
uniform float u_occlusionStrength;


#ifdef HAS_BASECOLORMAP
    uniform sampler2D u_baseColorSampler;
#endif

#ifdef O3_NORMAL_TEXTURE
    uniform sampler2D u_normalTexture;
#endif

#ifdef HAS_EMISSIVEMAP
    uniform sampler2D u_emissiveSampler;
#endif

#ifdef HAS_METALROUGHNESSMAP
    uniform sampler2D u_metallicRoughnessSampler;
#endif


#ifdef HAS_SPECULARGLOSSINESSMAP
    uniform sampler2D u_specularGlossinessSampler;
#endif

#ifdef HAS_OCCLUSIONMAP
    uniform sampler2D u_occlusionSampler;
#endif


struct ReflectedLight {
    vec3 directDiffuse;
    vec3 directSpecular;
    vec3 indirectDiffuse;
    vec3 indirectSpecular;
};
struct GeometricContext {
    vec3  position;
    vec3  normal;
    vec3  viewDir;
};
struct PhysicalMaterial {
    vec3  diffuseColor;
    float roughness;
    vec3  specularColor;
    float opacity;
};
