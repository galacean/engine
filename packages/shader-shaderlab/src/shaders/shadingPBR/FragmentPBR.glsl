#ifndef MATERIAL_INPUT_PBR_INCLUDED
#define MATERIAL_INPUT_PBR_INCLUDED

#include "Normal.glsl"

float material_AlphaCutoff;
vec4 material_BaseColor;
float material_Metal;
float material_Roughness;
float material_IOR;
vec3 material_PBRSpecularColor;
float material_Glossiness;
vec3 material_EmissiveColor;
float material_NormalIntensity;
float material_OcclusionIntensity;
float material_OcclusionTextureCoord;

#ifdef MATERIAL_ENABLE_CLEAR_COAT
    float material_ClearCoat;
    float material_ClearCoatRoughness;

    #ifdef MATERIAL_HAS_CLEAR_COAT_TEXTURE
        sampler2D material_ClearCoatTexture;
    #endif

    #ifdef MATERIAL_HAS_CLEAR_COAT_ROUGHNESS_TEXTURE
        sampler2D material_ClearCoatRoughnessTexture;
    #endif

    #ifdef MATERIAL_HAS_CLEAR_COAT_NORMAL_TEXTURE
        sampler2D material_ClearCoatNormalTexture;
    #endif
#endif

#ifdef MATERIAL_ENABLE_ANISOTROPY
    vec3 material_AnisotropyInfo;
    #ifdef MATERIAL_HAS_ANISOTROPY_TEXTURE
        sampler2D material_AnisotropyTexture;
    #endif
#endif

#ifdef MATERIAL_ENABLE_IRIDESCENCE
    vec4 material_IridescenceInfo;
    #ifdef MATERIAL_HAS_IRIDESCENCE_THICKNESS_TEXTURE
       sampler2D material_IridescenceThicknessTexture;
    #endif

    #ifdef MATERIAL_HAS_IRIDESCENCE_TEXTURE
       sampler2D material_IridescenceTexture;
    #endif
#endif

#ifdef MATERIAL_ENABLE_SHEEN
    float material_SheenRoughness;
    vec3 material_SheenColor;
    #ifdef MATERIAL_HAS_SHEEN_TEXTURE
       sampler2D material_SheenTexture;
    #endif

    #ifdef MATERIAL_HAS_SHEEN_ROUGHNESS_TEXTURE
       sampler2D material_SheenRoughnessTexture;
    #endif
#endif

#ifdef MATERIAL_ENABLE_TRANSMISSION
    float material_Transmission;
    #ifdef MATERIAL_HAS_TRANSMISSION_TEXTURE
        sampler2D material_TransmissionTexture;
    #endif

    #ifdef MATERIAL_HAS_THICKNESS
        vec3 material_AttenuationColor;
        float material_AttenuationDistance;
        float material_Thickness;
        #ifdef MATERIAL_HAS_THICKNESS_TEXTURE
            sampler2D material_ThicknessTexture;
        #endif
    #endif
#endif

// Texture
#ifdef MATERIAL_HAS_BASETEXTURE
    sampler2D material_BaseTexture;
#endif

#ifdef MATERIAL_HAS_NORMALTEXTURE
    sampler2D material_NormalTexture;
#endif

#ifdef MATERIAL_HAS_EMISSIVETEXTURE
    sampler2D material_EmissiveTexture;
#endif

#ifdef MATERIAL_HAS_ROUGHNESS_METALLIC_TEXTURE
    sampler2D material_RoughnessMetallicTexture;
#endif


#ifdef MATERIAL_HAS_SPECULAR_GLOSSINESS_TEXTURE
    sampler2D material_SpecularGlossinessTexture;
#endif

#ifdef MATERIAL_HAS_OCCLUSION_TEXTURE
    sampler2D material_OcclusionTexture;
#endif


#ifdef MATERIAL_ENABLE_ANISOTROPY
    // Aniso Bent Normals
    // Mc Alley https://www.gdcvault.com/play/1022235/Rendering-the-World-of-Far 
    vec3 getAnisotropicBentNormal(SurfaceData surfaceData) {
        vec3  anisotropyDirection = (surfaceData.anisotropy >= 0.0) ? surfaceData.anisotropicB : surfaceData.anisotropicT;
        vec3  anisotropicTangent  = cross(anisotropyDirection, surfaceData.viewDir);
        vec3  anisotropicNormal   = cross(anisotropicTangent, anisotropyDirection);
        // reduce stretching for (roughness < 0.2), refer to https://advances.realtimerendering.com/s2018/Siggraph%202018%20HDRP%20talk_with%20notes.pdf 80
        vec3  bentNormal          = normalize( mix(surfaceData.normal, anisotropicNormal, abs(surfaceData.anisotropy) * saturate( 5.0 * surfaceData.roughness)) );

        return bentNormal;
    }
#endif


SurfaceData getSurfaceData(Varyings v, vec2 aoUV, bool isFrontFacing){
    SurfaceData surfaceData;

    vec2 uv = v.uv;

    // common
    vec4 baseColor = material_BaseColor;
    float metallic = material_Metal;
    float roughness = material_Roughness;
    vec3 specularColor = material_PBRSpecularColor;
    float glossiness = material_Glossiness;
    float f0 = pow2( (material_IOR - 1.0) / (material_IOR + 1.0) );
    vec3 emissiveRadiance = material_EmissiveColor;

    #ifdef MATERIAL_HAS_BASETEXTURE
        baseColor *= texture2D_SRGB(material_BaseTexture, uv);
    #endif

    #ifdef RENDERER_ENABLE_VERTEXCOLOR
        baseColor *= v.vertexColor;
    #endif


    #ifdef MATERIAL_IS_ALPHA_CUTOFF
        if( baseColor.a < material_AlphaCutoff ) {
            discard;
        }
    #endif

    #ifdef MATERIAL_HAS_ROUGHNESS_METALLIC_TEXTURE
        vec4 metalRoughMapColor = texture2D( material_RoughnessMetallicTexture, uv );
        roughness *= metalRoughMapColor.g;
        metallic *= metalRoughMapColor.b;
    #endif

    #ifdef MATERIAL_HAS_SPECULAR_GLOSSINESS_TEXTURE
        vec4 specularGlossinessColor = texture2D_SRGB(material_SpecularGlossinessTexture, uv);
        specularColor *= specularGlossinessColor.rgb;
        glossiness *= specularGlossinessColor.a;
        roughness =  1.0 - glossiness;
    #endif

    #ifdef MATERIAL_HAS_EMISSIVETEXTURE
        emissiveRadiance *= texture2D_SRGB(material_EmissiveTexture, uv).rgb;
    #endif

    surfaceData.albedoColor = baseColor.rgb;
    surfaceData.specularColor = specularColor;
    surfaceData.emissiveColor = emissiveRadiance;
    surfaceData.metallic = metallic;
    surfaceData.roughness = roughness;
    surfaceData.f0 = f0;
    surfaceData.IOR = material_IOR;


    #ifdef MATERIAL_IS_TRANSPARENT
        surfaceData.opacity = baseColor.a;
    #else
        surfaceData.opacity = 1.0;
    #endif


    // Geometry
    surfaceData.position = v.positionWS;
    
    #ifdef CAMERA_ORTHOGRAPHIC
        surfaceData.viewDir = -camera_Forward;
    #else
        surfaceData.viewDir = normalize(camera_Position - v.positionWS);
    #endif

    // Normal
    #ifdef RENDERER_HAS_NORMAL
        vec3 normal = normalize(v.normalWS);
    #elif defined(HAS_DERIVATIVES)
        vec3 pos_dx = dFdx(v.positionWS);
        vec3 pos_dy = dFdy(v.positionWS);
        vec3 normal = normalize( cross(pos_dx, pos_dy) );
        normal *= camera_ProjectionParams.x;
    #else
        vec3 normal = vec3(0, 0, 1);
    #endif
    
    normal *= float( isFrontFacing ) * 2.0 - 1.0;
    surfaceData.normal = normal;

    // Tangent
    #ifdef NEED_TANGENT
        #if defined(RENDERER_HAS_NORMAL) && defined(RENDERER_HAS_TANGENT)
            surfaceData.tangent = v.tangentWS;
            surfaceData.bitangent = v.bitangentWS;
            mat3 tbn = mat3(v.tangentWS, v.bitangentWS, v.normalWS);
        #else
            mat3 tbn = getTBNByDerivatives(uv, normal, v.positionWS, isFrontFacing);
            surfaceData.tangent = tbn[0];
            surfaceData.bitangent = tbn[1];
        #endif

        #ifdef MATERIAL_HAS_NORMALTEXTURE
            surfaceData.normal = getNormalByNormalTexture(tbn, material_NormalTexture, material_NormalIntensity, uv, isFrontFacing);
        #endif
    #endif

    surfaceData.dotNV = saturate( dot(surfaceData.normal, surfaceData.viewDir) );

    // Clear Coat
     #ifdef MATERIAL_ENABLE_CLEAR_COAT
        #ifdef MATERIAL_HAS_CLEAR_COAT_NORMAL_TEXTURE
            surfaceData.clearCoatNormal = getNormalByNormalTexture(mat3(surfaceData.tangent, surfaceData.bitangent, surfaceData.normal), material_ClearCoatNormalTexture, material_NormalIntensity, uv, isFrontFacing);
        #else
            surfaceData.clearCoatNormal = normal;
        #endif
        surfaceData.clearCoatDotNV = saturate( dot(surfaceData.clearCoatNormal, surfaceData.viewDir) );

        surfaceData.clearCoat = material_ClearCoat;
        surfaceData.clearCoatRoughness = material_ClearCoatRoughness;

        #ifdef MATERIAL_HAS_CLEAR_COAT_TEXTURE
            surfaceData.clearCoat *= (texture2D( material_ClearCoatTexture, uv )).r;
        #endif

        #ifdef MATERIAL_HAS_CLEAR_COAT_ROUGHNESS_TEXTURE
            surfaceData.clearCoatRoughness *= (texture2D( material_ClearCoatRoughnessTexture, uv )).g;
        #endif

        surfaceData.clearCoat = saturate( surfaceData.clearCoat );
        surfaceData.clearCoatRoughness = max(MIN_PERCEPTUAL_ROUGHNESS, min(surfaceData.clearCoatRoughness + getAARoughnessFactor(surfaceData.clearCoatNormal), 1.0));
    #endif

    // Anisotropy
    #ifdef MATERIAL_ENABLE_ANISOTROPY
        float anisotropy = material_AnisotropyInfo.z;
        vec3 anisotropicDirection = vec3(material_AnisotropyInfo.xy, 0.0);
        #ifdef MATERIAL_HAS_ANISOTROPY_TEXTURE
            vec3 anisotropyTextureInfo = (texture2D( material_AnisotropyTexture, uv )).rgb;
            anisotropy *= anisotropyTextureInfo.b;
            anisotropicDirection.xy *= anisotropyTextureInfo.rg * 2.0 - 1.0;
        #endif

        surfaceData.anisotropy = anisotropy;
        surfaceData.anisotropicT = normalize(mat3(surfaceData.tangent, surfaceData.bitangent, surfaceData.normal) * anisotropicDirection);
        surfaceData.anisotropicB = normalize(cross(surfaceData.normal, surfaceData.anisotropicT));
        surfaceData.anisotropicN = getAnisotropicBentNormal(surfaceData);
    #endif

    //Iridescence
    #ifdef MATERIAL_ENABLE_IRIDESCENCE
        surfaceData.iridescenceFactor = material_IridescenceInfo.x;
        surfaceData.iridescenceIOR = material_IridescenceInfo.y;

        #ifdef MATERIAL_HAS_IRIDESCENCE_THICKNESS_TEXTURE
           float iridescenceThicknessWeight = texture2D( material_IridescenceThicknessTexture, uv).g;
           surfaceData.iridescenceThickness = mix(material_IridescenceInfo.z, material_IridescenceInfo.w, iridescenceThicknessWeight);
        #else
           surfaceData.iridescenceThickness = material_IridescenceInfo.w;
        #endif
       
        #ifdef MATERIAL_HAS_IRIDESCENCE_TEXTURE
           surfaceData.iridescenceFactor *= texture2D( material_IridescenceTexture, uv).r;
        #endif
    #endif

    #ifdef MATERIAL_ENABLE_SHEEN
        vec3 sheenColor = material_SheenColor;
        #ifdef MATERIAL_HAS_SHEEN_TEXTURE
            sheenColor *= texture2D_SRGB(material_SheenTexture, uv).rgb;
        #endif
        surfaceData.sheenColor = sheenColor;

        surfaceData.sheenRoughness = material_SheenRoughness;
        #ifdef MATERIAL_HAS_SHEEN_ROUGHNESS_TEXTURE
            surfaceData.sheenRoughness *= texture2D(material_SheenRoughnessTexture, uv).a;
        #endif
    #endif

    #ifdef MATERIAL_ENABLE_TRANSMISSION 
        surfaceData.transmission = material_Transmission;
        #ifdef MATERIAL_HAS_TRANSMISSION_TEXTURE
            surfaceData.transmission *= texture2D(material_TransmissionTexture, uv).r;
        #endif

        #ifdef MATERIAL_HAS_THICKNESS
                surfaceData.absorptionCoefficient = -log(material_AttenuationColor + HALF_EPS) / max(HALF_EPS, material_AttenuationDistance);
                surfaceData.thickness = max(material_Thickness, 0.0001);
                #ifdef MATERIAL_HAS_THICKNESS_TEXTURE
                    surfaceData.thickness *= texture2D( material_ThicknessTexture, uv).g;
                #endif
        #endif    
    #endif

    // AO
    float diffuseAO = 1.0;
    float specularAO = 1.0;

    #ifdef MATERIAL_HAS_OCCLUSION_TEXTURE
        diffuseAO = ((texture2D(material_OcclusionTexture, aoUV)).r - 1.0) * material_OcclusionIntensity + 1.0;
    #endif

    #if defined(MATERIAL_HAS_OCCLUSION_TEXTURE) && defined(SCENE_USE_SPECULAR_ENV) 
        specularAO = saturate( pow( surfaceData.dotNV + diffuseAO, exp2( - 16.0 * surfaceData.roughness - 1.0 ) ) - 1.0 + diffuseAO );
    #endif

    surfaceData.diffuseAO = diffuseAO;
    surfaceData.specularAO = specularAO;

    return surfaceData;
}



#endif