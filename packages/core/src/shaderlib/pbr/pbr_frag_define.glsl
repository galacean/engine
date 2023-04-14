uniform float material_AlphaCutoff;
uniform vec4 material_BaseColor;
uniform float material_Metal;
uniform float material_Roughness;
uniform vec3 material_PBRSpecularColor;
uniform float material_Glossiness;
uniform vec3 material_EmissiveColor;

#ifdef MATERIAL_CLEARCOAT
    uniform float material_ClearCoat;
    uniform float material_ClearCoatRoughness;
#endif

uniform float material_NormalIntensity;
uniform float material_OcclusionIntensity;
uniform float material_OcclusionTextureCoord;

// Texture
#ifdef MATERIAL_HAS_BASETEXTURE
    uniform sampler2D material_BaseTexture;
#endif

#ifdef MATERIAL_HAS_NORMALTEXTURE
    uniform sampler2D material_NormalTexture;
#endif

#ifdef MATERIAL_HAS_EMISSIVETEXTURE
    uniform sampler2D MATERIAL_HAS_EMISSIVETEXTURE;
#endif

#ifdef MATERIAL_ROUGHNESSMETALLICTEXTURE
    uniform sampler2D material_RoughnessMetallicTexture;
#endif


#ifdef MATERIAL_HAS_SPECULARGLOSSINESSTEXTURE
    uniform sampler2D material_SpecularGlossinessTexture;
#endif

#ifdef MATERIAL_OCCLUSIONTEXTURE
    uniform sampler2D material_OcclusionTexture;
#endif

#ifdef MATERIAL_HAS_CLEARCOATTEXTURE
    uniform sampler2D material_ClearCoatTexture;
#endif

#ifdef MATERIAL_HAS_CLEARCOATROUGHNESSTEXTURE
    uniform sampler2D material_ClearCoatRoughnessTexture;
#endif

#ifdef MATERIAL_HAS_CLEARCOATNORMALTEXTURE
    uniform sampler2D material_ClearCoatNormalTexture;
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
    
    #ifdef MATERIAL_CLEARCOAT
        vec3 clearCoatNormal;
        float clearCoatDotNV;
    #endif

};

struct Material {
    vec3  diffuseColor;
    float roughness;
    vec3  specularColor;
    float opacity;
    #ifdef MATERIAL_CLEARCOAT
        float clearCoat;
        float clearCoatRoughness;
    #endif

};
