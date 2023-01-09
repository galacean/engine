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

void initGeometry(out Geometry geometry){
    geometry.position = v_pos;
    geometry.viewDir =  normalize(u_cameraPos - v_pos);

    #if defined(NORMALTEXTURE) || defined(HAS_CLEARCOATNORMALTEXTURE)
        mat3 tbn = getTBN();
    #endif

    #ifdef NORMALTEXTURE
        geometry.normal = getNormalByNormalTexture(tbn, u_normalTexture, u_normalIntensity, v_uv);
    #else
        geometry.normal = getNormal();
    #endif

    geometry.dotNV = saturate( dot(geometry.normal, geometry.viewDir) );


    #ifdef CLEARCOAT
        #ifdef HAS_CLEARCOATNORMALTEXTURE
            geometry.clearCoatNormal = getNormalByNormalTexture(tbn, u_clearCoatNormalTexture, u_normalIntensity, v_uv);
        #else
            geometry.clearCoatNormal = getNormal();
        #endif
        geometry.clearCoatDotNV = saturate( dot(geometry.clearCoatNormal, geometry.viewDir) );
    #endif

}

void initMaterial(out Material material, const in Geometry geometry){
        vec4 baseColor = u_baseColor;
        float metal = u_metal;
        float roughness = u_roughness;
        vec3 specularColor = u_PBRSpecularColor;
        float glossiness = u_glossiness;
        float alphaCutoff = u_alphaCutoff;

        #ifdef BASETEXTURE
            vec4 baseTextureColor = texture2D(u_baseTexture, v_uv);
            #ifndef OASIS_COLORSPACE_GAMMA
                baseTextureColor = gammaToLinear(baseTextureColor);
            #endif
            baseColor *= baseTextureColor;
        #endif

        #ifdef O3_HAS_VERTEXCOLOR
            baseColor *= v_color;
        #endif


        #ifdef ALPHA_CUTOFF
            if( baseColor.a < alphaCutoff ) {
                discard;
            }
        #endif

        #ifdef ROUGHNESSMETALLICTEXTURE
            vec4 metalRoughMapColor = texture2D( u_roughnessMetallicTexture, v_uv );
            roughness *= metalRoughMapColor.g;
            metal *= metalRoughMapColor.b;
        #endif

        #ifdef SPECULARGLOSSINESSTEXTURE
            vec4 specularGlossinessColor = texture2D(u_specularGlossinessTexture, v_uv );
            #ifndef OASIS_COLORSPACE_GAMMA
                specularGlossinessColor = gammaToLinear(specularGlossinessColor);
            #endif
            specularColor *= specularGlossinessColor.rgb;
            glossiness *= specularGlossinessColor.a;
        #endif


        #ifdef IS_METALLIC_WORKFLOW
            material.diffuseColor = baseColor.rgb * ( 1.0 - metal );
            material.specularColor = mix( vec3( 0.04), baseColor.rgb, metal );
            material.roughness = roughness;
        #else
            float specularStrength = max( max( specularColor.r, specularColor.g ), specularColor.b );
            material.diffuseColor = baseColor.rgb * ( 1.0 - specularStrength );
            material.specularColor = specularColor;
            material.roughness = 1.0 - glossiness;
        #endif

        material.roughness = max(material.roughness, getAARoughnessFactor(geometry.normal));

        #ifdef CLEARCOAT
            material.clearCoat = u_clearCoat;
            material.clearCoatRoughness = u_clearCoatRoughness;
            #ifdef HAS_CLEARCOATTEXTURE
                material.clearCoat *= texture2D( u_clearCoatTexture, v_uv ).r;
            #endif
            #ifdef HAS_CLEARCOATROUGHNESSTEXTURE
                material.clearCoatRoughness *= texture2D( u_clearCoatRoughnessTexture, v_uv ).g;
            #endif
            material.clearCoat = saturate( material.clearCoat );
            material.clearCoatRoughness = max(material.clearCoatRoughness, getAARoughnessFactor(geometry.clearCoatNormal));
        #endif

        #ifdef OASIS_TRANSPARENT
            material.opacity = baseColor.a;
        #else
            material.opacity = 1.0;
        #endif
}

// direct + indirect
#include <brdf>
#include <direct_irradiance_frag_define>
#include <ibl_frag_define>
