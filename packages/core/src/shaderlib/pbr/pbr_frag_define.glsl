#define MIN_PERCEPTUAL_ROUGHNESS 0.045
#define MIN_ROUGHNESS            0.002025

uniform float material_AlphaCutoff;
uniform vec4 material_BaseColor;
uniform float material_Metal;
uniform float material_Roughness;
uniform float material_IOR;
uniform vec3 material_EmissiveColor;
uniform float material_NormalIntensity;
uniform float material_OcclusionIntensity;
uniform float material_OcclusionTextureCoord;
uniform float material_SpecularIntensity;
uniform vec3  material_SpecularColor;

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

#ifdef MATERIAL_HAS_SPECULAR_TEXTURE
    uniform sampler2D material_SpecularIntensityTexture;
#endif

#ifdef MATERIAL_HAS_SPECULAR_COLOR_TEXTURE
    uniform sampler2D material_SpecularColorTexture;
#endif

#ifdef MATERIAL_HAS_OCCLUSION_TEXTURE
    uniform sampler2D material_OcclusionTexture;
#endif


#ifdef MATERIAL_ENABLE_SHEEN
    uniform float material_SheenRoughness;
    uniform vec3 material_SheenColor;
    #ifdef MATERIAL_HAS_SHEEN_TEXTURE
       uniform sampler2D material_SheenTexture;
    #endif

    #ifdef MATERIAL_HAS_SHEEN_ROUGHNESS_TEXTURE
       uniform sampler2D material_SheenRoughnessTexture;
    #endif
#endif


#ifdef MATERIAL_ENABLE_IRIDESCENCE
    uniform vec4 material_IridescenceInfo;
    #ifdef MATERIAL_HAS_IRIDESCENCE_THICKNESS_TEXTURE
       uniform sampler2D material_IridescenceThicknessTexture;
    #endif

    #ifdef MATERIAL_HAS_IRIDESCENCE_TEXTURE
       uniform sampler2D material_IridescenceTexture;
    #endif
#endif

#ifdef MATERIAL_ENABLE_TRANSMISSION
    uniform float material_Transmission;
    #ifdef MATERIAL_HAS_TRANSMISSION_TEXTURE
        uniform sampler2D material_TransmissionTexture;
    #endif

    #ifdef MATERIAL_HAS_THICKNESS
        uniform vec3 material_AttenuationColor;
        uniform float material_AttenuationDistance;
        uniform float material_Thickness;

        #ifdef MATERIAL_HAS_THICKNESS_TEXTURE
            uniform sampler2D material_ThicknessTexture;
        #endif
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
    vec3  specularF0;
    float specularF90;
    float specularIntensity;
    vec3  specularColor;
    float opacity;
    float diffuseAO;
    float specularAO;
    vec3  envSpecularDFG;
    float IOR;

    #ifdef MATERIAL_ENABLE_CLEAR_COAT
        float clearCoat;
        float clearCoatRoughness;
    #endif

    #ifdef MATERIAL_ENABLE_IRIDESCENCE
        float iridescenceIOR;
        float iridescenceFactor;
        float iridescenceThickness;
        vec3 iridescenceSpecularColor;
    #endif

    #ifdef MATERIAL_ENABLE_SHEEN
        float sheenRoughness;
        vec3  sheenColor;
        float sheenScaling;
        float approxIBLSheenDG;
    #endif

    #ifdef MATERIAL_ENABLE_TRANSMISSION 
        vec3 absorptionCoefficient;
        float transmission;
        float thickness;
    #endif
};