#include <normal_get>


float computeSpecularOcclusion(float ambientOcclusion, float roughness, float dotNV ) {
    return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}

float getAARoughnessFactor(vec3 normal) {
    // Kaplanyan 2016, "Stable specular highlights"
    // Tokuyoshi 2017, "Error Reduction and Simplification for Shading Anti-Aliasing"
    // Tokuyoshi and Kaplanyan 2019, "Improved Geometric Specular Antialiasing"
    #ifdef HAS_DERIVATIVES
        vec3 dxy = max( abs(dFdx(normal)), abs(dFdy(normal)) );
        return 0.04 + max( max(dxy.x, dxy.y), dxy.z );
    #else
        return 0.04;
    #endif
}

#ifdef MATERIAL_ENABLE_ANISOTROPY
// Aniso Bent Normals
// Mc Alley https://www.gdcvault.com/play/1022235/Rendering-the-World-of-Far 
vec3 getAnisotropicBentNormal(Geometry geometry, vec3 n) {
    vec3  anisotropyDirection = geometry.anisotropy >= 0.0 ? geometry.anisotropicB : geometry.anisotropicT;
    vec3  anisotropicTangent  = cross(anisotropyDirection, geometry.viewDir);
    vec3  anisotropicNormal   = cross(anisotropicTangent, anisotropyDirection);
    vec3  bentNormal          = normalize(mix(n, anisotropicNormal, abs(geometry.anisotropy)));

    return bentNormal;
}
#endif

void initGeometry(out Geometry geometry, bool isFrontFacing){
    geometry.position = v_pos;
    geometry.viewDir =  normalize(camera_Position - v_pos);

    #if defined(MATERIAL_HAS_NORMALTEXTURE) || defined(MATERIAL_HAS_CLEAR_COAT_NORMAL_TEXTURE) || defined(MATERIAL_ENABLE_ANISOTROPY)
        mat3 tbn = getTBN(isFrontFacing);
    #endif

    #ifdef MATERIAL_HAS_NORMALTEXTURE
        geometry.normal = getNormalByNormalTexture(tbn, material_NormalTexture, material_NormalIntensity, v_uv, isFrontFacing);
    #else
        geometry.normal = getNormal(isFrontFacing);
    #endif

    geometry.dotNV = saturate( dot(geometry.normal, geometry.viewDir) );


    #ifdef MATERIAL_ENABLE_CLEAR_COAT
        #ifdef MATERIAL_HAS_CLEAR_COAT_NORMAL_TEXTURE
            geometry.clearCoatNormal = getNormalByNormalTexture(tbn, material_ClearCoatNormalTexture, material_NormalIntensity, v_uv, isFrontFacing);
        #else
            geometry.clearCoatNormal = getNormal(isFrontFacing);
        #endif
        geometry.clearCoatDotNV = saturate( dot(geometry.clearCoatNormal, geometry.viewDir) );
    #endif

    #ifdef MATERIAL_ENABLE_ANISOTROPY
        geometry.anisotropy = material_Anisotropy;
        geometry.anisotropicT = normalize(tbn * material_AnisotropyDirection);
        geometry.anisotropicB = normalize(cross(geometry.normal, geometry.anisotropicT));
        geometry.anisotropicN = getAnisotropicBentNormal(geometry, geometry.normal);
    #endif
}

void initMaterial(out Material material, const in Geometry geometry){
        vec4 baseColor = material_BaseColor;
        float metal = material_Metal;
        float roughness = material_Roughness;
        vec3 specularColor = material_PBRSpecularColor;
        float glossiness = material_Glossiness;
        float alphaCutoff = material_AlphaCutoff;
        float F0 = pow2( (material_IOR - 1.0) / (material_IOR + 1.0) );

        #ifdef MATERIAL_HAS_BASETEXTURE
            vec4 baseTextureColor = texture2D(material_BaseTexture, v_uv);
            #ifndef ENGINE_IS_COLORSPACE_GAMMA
                baseTextureColor = gammaToLinear(baseTextureColor);
            #endif
            baseColor *= baseTextureColor;
        #endif

        #ifdef RENDERER_ENABLE_VERTEXCOLOR
            baseColor *= v_color;
        #endif


        #ifdef MATERIAL_IS_ALPHA_CUTOFF
            if( baseColor.a < alphaCutoff ) {
                discard;
            }
        #endif

        #ifdef MATERIAL_HAS_ROUGHNESS_METALLIC_TEXTURE
            vec4 metalRoughMapColor = texture2D( material_RoughnessMetallicTexture, v_uv );
            roughness *= metalRoughMapColor.g;
            metal *= metalRoughMapColor.b;
        #endif

        #ifdef MATERIAL_HAS_SPECULAR_GLOSSINESS_TEXTURE
            vec4 specularGlossinessColor = texture2D(material_SpecularGlossinessTexture, v_uv );
            #ifndef ENGINE_IS_COLORSPACE_GAMMA
                specularGlossinessColor = gammaToLinear(specularGlossinessColor);
            #endif
            specularColor *= specularGlossinessColor.rgb;
            glossiness *= specularGlossinessColor.a;
        #endif


        #ifdef IS_METALLIC_WORKFLOW
            material.diffuseColor = baseColor.rgb * ( 1.0 - metal );
            material.specularColor = mix( vec3(F0), baseColor.rgb, metal );
            material.roughness = roughness;
        #else
            float specularStrength = max( max( specularColor.r, specularColor.g ), specularColor.b );
            material.diffuseColor = baseColor.rgb * ( 1.0 - specularStrength );
            material.specularColor = specularColor;
            material.roughness = 1.0 - glossiness;
        #endif

        material.roughness = max(material.roughness, getAARoughnessFactor(geometry.normal));

        #ifdef MATERIAL_ENABLE_CLEAR_COAT
            material.clearCoat = material_ClearCoat;
            material.clearCoatRoughness = material_ClearCoatRoughness;
            #ifdef MATERIAL_HAS_CLEAR_COAT_TEXTURE
                material.clearCoat *= texture2D( material_ClearCoatTexture, v_uv ).r;
            #endif
            #ifdef MATERIAL_HAS_CLEAR_COAT_ROUGHNESS_TEXTURE
                material.clearCoatRoughness *= texture2D( material_ClearCoatRoughnessTexture, v_uv ).g;
            #endif
            material.clearCoat = saturate( material.clearCoat );
            material.clearCoatRoughness = max(material.clearCoatRoughness, getAARoughnessFactor(geometry.clearCoatNormal));
        #endif

        #ifdef MATERIAL_IS_TRANSPARENT
            material.opacity = baseColor.a;
        #else
            material.opacity = 1.0;
        #endif
}

// direct + indirect
#include <brdf>
#include <direct_irradiance_frag_define>
#include <ibl_frag_define>
