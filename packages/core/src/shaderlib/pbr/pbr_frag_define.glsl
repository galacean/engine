uniform float u_alphaCutoff;
uniform vec4 u_baseColor;
uniform float u_metal;
uniform float u_roughness;
uniform vec3 u_specularColor;
uniform float u_glossiness;
uniform vec3 u_emissiveColor;

#ifdef CLEARCOAT
    uniform float u_clearCoat;
    uniform float u_clearCoatRoughness;
#endif

uniform float u_normalIntensity;
uniform float u_occlusionIntensity;
uniform float u_occlusionTextureCoord;

// Texture
#ifdef BASETEXTURE
    uniform sampler2D u_baseTexture;
#endif

#ifdef NORMALTEXTURE
    uniform sampler2D u_normalTexture;
#endif

#ifdef EMISSIVETEXTURE
    uniform sampler2D u_emissiveTexture;
#endif

#ifdef ROUGHNESSMETALLICTEXTURE
    uniform sampler2D u_roughnessMetallicTexture;
#endif


#ifdef SPECULARGLOSSINESSTEXTURE
    uniform sampler2D u_specularGlossinessSampler;
#endif

#ifdef OCCLUSIONTEXTURE
    uniform sampler2D u_occlusionTexture;
#endif

#ifdef HAS_CLEARCOATTEXTURE
    uniform sampler2D u_clearCoatTexture;
#endif

#ifdef HAS_CLEARCOATROUGHNESSTEXTURE
    uniform sampler2D u_clearCoatRoughnessTexture;
#endif

#ifdef HAS_CLEARCOATNORMALTEXTURE
    uniform sampler2D u_clearCoatNormalTexture;
#endif



// Runtime
struct ReflectedLight {
    vec3 directDiffuse;
    vec3 directSpecular;
    vec3 indirectDiffuse;
    vec3 indirectSpecular;
};

struct Geometry {
    vec3  position;
    vec3  normal;
    vec3  viewDir;
    float dotNV;
    
    #ifdef CLEARCOAT
        vec3 clearCoatNormal;
        float clearCoatDotNV;
    #endif

};

struct Material {
    vec3  diffuseColor;
    float roughness;
    vec3  specularColor;
    float opacity;
    #ifdef CLEARCOAT
        float clearCoat;
        float clearCoatRoughness;
    #endif

};
