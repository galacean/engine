#include <normal_get>
#include <brdf>
#include <btdf>

// direct + indirect
#include <direct_irradiance_frag_define>
#include <ibl_frag_define>


float computeSpecularOcclusion(float ambientOcclusion, float roughness, float dotNV ) {
    return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}

float getAARoughnessFactor(vec3 normal) {
    // Kaplanyan 2016, "Stable specular highlights"
    // Tokuyoshi 2017, "Error Reduction and Simplification for Shading Anti-Aliasing"
    // Tokuyoshi and Kaplanyan 2019, "Improved Geometric Specular Antialiasing"
    #ifdef HAS_DERIVATIVES
        vec3 dxy = max( abs(dFdx(normal)), abs(dFdy(normal)) );
        return max( max(dxy.x, dxy.y), dxy.z );
    #else
        return 0.0;
    #endif
}

#ifdef MATERIAL_ENABLE_ANISOTROPY
    // Aniso Bent Normals
    // Mc Alley https://www.gdcvault.com/play/1022235/Rendering-the-World-of-Far 
    vec3 getAnisotropicBentNormal(Geometry geometry, vec3 n, float roughness) {
        vec3  anisotropyDirection = geometry.anisotropy >= 0.0 ? geometry.anisotropicB : geometry.anisotropicT;
        vec3  anisotropicTangent  = cross(anisotropyDirection, geometry.viewDir);
        vec3  anisotropicNormal   = cross(anisotropicTangent, anisotropyDirection);
        // reduce stretching for (roughness < 0.2), refer to https://advances.realtimerendering.com/s2018/Siggraph%202018%20HDRP%20talk_with%20notes.pdf 80
        vec3  bentNormal          = normalize( mix(n, anisotropicNormal, abs(geometry.anisotropy) * saturate( 5.0 * roughness)) );

        return bentNormal;
    }
#endif

void initGeometry(out Geometry geometry, bool isFrontFacing){
    geometry.position = v_pos;
    #ifdef CAMERA_ORTHOGRAPHIC
        geometry.viewDir =  -camera_Forward;
    #else
        geometry.viewDir =  normalize(camera_Position - v_pos);
    #endif
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
        float anisotropy = material_AnisotropyInfo.z;
        vec3 anisotropicDirection = vec3(material_AnisotropyInfo.xy, 0.0);
        #ifdef MATERIAL_HAS_ANISOTROPY_TEXTURE
            vec3 anisotropyTextureInfo = texture2D( material_AnisotropyTexture, v_uv ).rgb;
            anisotropy *= anisotropyTextureInfo.b;
            anisotropicDirection.xy *= anisotropyTextureInfo.rg * 2.0 - 1.0;
        #endif

        geometry.anisotropy = anisotropy;
        geometry.anisotropicT = normalize(tbn * anisotropicDirection);
        geometry.anisotropicB = normalize(cross(geometry.normal, geometry.anisotropicT));
    #endif
}

void initMaterial(out Material material, inout Geometry geometry){
        vec4 baseColor = material_BaseColor;
        float metal = material_Metal;
        float roughness = material_Roughness;
        vec3 specularColor = material_PBRSpecularColor;
        float glossiness = material_Glossiness;
        float alphaCutoff = material_AlphaCutoff;
        float f0 = pow2( (material_IOR - 1.0) / (material_IOR + 1.0) );

        material.f0 = f0;
        material.IOR = material_IOR;

        #ifdef MATERIAL_HAS_BASETEXTURE
            baseColor *= texture2DSRGB(material_BaseTexture, v_uv);
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
            vec4 specularGlossinessColor = texture2DSRGB(material_SpecularGlossinessTexture, v_uv);
            specularColor *= specularGlossinessColor.rgb;
            glossiness *= specularGlossinessColor.a;
        #endif


        #ifdef IS_METALLIC_WORKFLOW
            material.diffuseColor = baseColor.rgb * ( 1.0 - metal );
            material.specularColor = mix( vec3(f0), baseColor.rgb, metal );
            material.roughness = roughness;
        #else
            float specularStrength = max( max( specularColor.r, specularColor.g ), specularColor.b );
            material.diffuseColor = baseColor.rgb * ( 1.0 - specularStrength );
            material.specularColor = specularColor;
            material.roughness = 1.0 - glossiness;
        #endif

        material.roughness = max(MIN_PERCEPTUAL_ROUGHNESS, min(material.roughness + getAARoughnessFactor(geometry.normal), 1.0));

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
            material.clearCoatRoughness = max(MIN_PERCEPTUAL_ROUGHNESS, min(material.clearCoatRoughness + getAARoughnessFactor(geometry.clearCoatNormal), 1.0));
        #endif

        #ifdef MATERIAL_IS_TRANSPARENT
            material.opacity = baseColor.a;
        #else
            material.opacity = 1.0;
        #endif
        #ifdef MATERIAL_ENABLE_ANISOTROPY
            geometry.anisotropicN = getAnisotropicBentNormal(geometry, geometry.normal, material.roughness);
        #endif

        material.envSpecularDFG = envBRDFApprox(material.specularColor, material.roughness, geometry.dotNV );

        // AO
        float diffuseAO = 1.0;
        float specularAO = 1.0;

        #ifdef MATERIAL_HAS_OCCLUSION_TEXTURE
            vec2 aoUV = v_uv;
            #ifdef RENDERER_HAS_UV1
                if(material_OcclusionTextureCoord == 1.0){
                    aoUV = v_uv1;
                }
            #endif
            diffuseAO = ((texture2D(material_OcclusionTexture, aoUV)).r - 1.0) * material_OcclusionIntensity + 1.0;
        #endif

        #if defined(MATERIAL_HAS_OCCLUSION_TEXTURE) && defined(SCENE_USE_SPECULAR_ENV) 
            specularAO = saturate( pow( geometry.dotNV + diffuseAO, exp2( - 16.0 * material.roughness - 1.0 ) ) - 1.0 + diffuseAO );
        #endif

        material.diffuseAO = diffuseAO;
        material.specularAO = specularAO;

        // Sheen
        #ifdef MATERIAL_ENABLE_SHEEN
            vec3 sheenColor = material_SheenColor;
            #ifdef MATERIAL_HAS_SHEEN_TEXTURE
                sheenColor *= texture2DSRGB(material_SheenTexture, v_uv).rgb;
            #endif
            material.sheenColor = sheenColor;

            material.sheenRoughness = material_SheenRoughness;
            #ifdef MATERIAL_HAS_SHEEN_ROUGHNESS_TEXTURE
                material.sheenRoughness *= texture2D(material_SheenRoughnessTexture, v_uv).a;
            #endif

            material.sheenRoughness = max(MIN_PERCEPTUAL_ROUGHNESS, min(material.sheenRoughness + getAARoughnessFactor(geometry.normal), 1.0));
            material.approxIBLSheenDG = prefilteredSheenDFG(geometry.dotNV, material.sheenRoughness);
            material.sheenScaling = 1.0 - material.approxIBLSheenDG * max(max(material.sheenColor.r, material.sheenColor.g), material.sheenColor.b);
        #endif

        // Iridescence
        #ifdef MATERIAL_ENABLE_IRIDESCENCE
            material.iridescenceFactor = material_IridescenceInfo.x;
            material.iridescenceIOR = material_IridescenceInfo.y;

            #ifdef MATERIAL_HAS_IRIDESCENCE_THICKNESS_TEXTURE
               float iridescenceThicknessWeight = texture2D( material_IridescenceThicknessTexture, v_uv).g;
               material.iridescenceThickness = mix(material_IridescenceInfo.z, material_IridescenceInfo.w, iridescenceThicknessWeight);
            #else
               material.iridescenceThickness = material_IridescenceInfo.w;
            #endif

            #ifdef MATERIAL_HAS_IRIDESCENCE_TEXTURE
               material.iridescenceFactor *= texture2D( material_IridescenceTexture, v_uv).r;
            #endif
             
            #ifdef MATERIAL_ENABLE_IRIDESCENCE
                float topIOR = 1.0;
                material.iridescenceSpecularColor = evalIridescenceSpecular(topIOR, geometry.dotNV, material.iridescenceIOR, material.specularColor, material.iridescenceThickness);   
            #endif
        #endif

        // Transmission
        #ifdef MATERIAL_ENABLE_TRANSMISSION 
            material.transmission = material_Transmission;
            #ifdef MATERIAL_HAS_TRANSMISSION_TEXTURE
                material.transmission *= texture2D(material_TransmissionTexture, v_uv).r;
            #endif

            #ifdef MATERIAL_HAS_THICKNESS
                material.absorptionCoefficient = -log(material_AttenuationColor + HALF_EPS) / max(HALF_EPS, material_AttenuationDistance);
                material.thickness = max(material_Thickness, 0.0001);
                #ifdef MATERIAL_HAS_THICKNESS_TEXTURE
                    material.thickness *= texture2D( material_ThicknessTexture, v_uv).g;
                #endif
            #endif    
        #endif

}


