#define MIN_PERCEPTUAL_ROUGHNESS 0.045
#define MIN_ROUGHNESS            0.002025

uniform float material_AlphaCutoff;
uniform vec4 material_BaseColor;
uniform float material_Metal;
uniform float material_Roughness;
uniform float material_IOR;
uniform vec3 material_PBRSpecularColor;
uniform float material_Glossiness;
uniform vec3 material_EmissiveColor;
uniform float material_NormalIntensity;
uniform float material_OcclusionIntensity;
uniform float material_OcclusionTextureCoord;

#ifdef MATERIAL_ENABLE_CLEAR_COAT
    uniform float material_ClearCoat;
    uniform float material_ClearCoatRoughness;

    #ifdef MATERIAL_HAS_CLEAR_COAT_TEXTURE
        uniform sampler2D material_ClearCoatTexture;
    #endif

    #ifdef MATERIAL_HAS_CLEAR_COAT_ROUGHNESS_TEXTURE
        uniform sampler2D material_ClearCoatRoughnessTexture;
    #endif

    #ifdef MATERIAL_HAS_CLEAR_COAT_NORMAL_TEXTURE
        uniform sampler2D material_ClearCoatNormalTexture;
    #endif
#endif

#ifdef MATERIAL_ENABLE_ANISOTROPY
    uniform vec3 material_AnisotropyInfo;
    #ifdef MATERIAL_HAS_ANISOTROPY_TEXTURE
        uniform sampler2D material_AnisotropyTexture;
    #endif
#endif

// Texture
#ifdef MATERIAL_HAS_BASETEXTURE
    uniform sampler2D material_BaseTexture;
#endif

#ifdef MATERIAL_HAS_NORMALTEXTURE
    uniform sampler2D material_NormalTexture;
#endif

#ifdef MATERIAL_HAS_EMISSIVETEXTURE
    uniform sampler2D material_EmissiveTexture;
#endif

#ifdef MATERIAL_HAS_ROUGHNESS_METALLIC_TEXTURE
    uniform sampler2D material_RoughnessMetallicTexture;
#endif


#ifdef MATERIAL_HAS_SPECULAR_GLOSSINESS_TEXTURE
    uniform sampler2D material_SpecularGlossinessTexture;
#endif

#ifdef MATERIAL_HAS_OCCLUSION_TEXTURE
    uniform sampler2D material_OcclusionTexture;
#endif

#ifdef MATERIAL_HAS_LIGHTMAP
    uniform sampler2D material_Lightmap;
    #ifdef MATERIAL_HAS_DIRLIGHTMAP
        uniform sampler2D material_DirLightmap;
    #endif
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
    
    #ifdef MATERIAL_ENABLE_CLEAR_COAT
        vec3 clearCoatNormal;
        float clearCoatDotNV;
    #endif

    #ifdef MATERIAL_ENABLE_ANISOTROPY
        vec3  anisotropicT;
        vec3  anisotropicB;
        vec3  anisotropicN;
        float anisotropy;
    #endif
};

struct Material {
    vec3  diffuseColor;
    float roughness;
    vec3  specularColor;
    float opacity;
    float f0;
    #ifdef MATERIAL_ENABLE_CLEAR_COAT
        float clearCoat;
        float clearCoatRoughness;
    #endif

};