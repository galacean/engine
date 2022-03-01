#include <normal_get>


float computeSpecularOcclusion(float ambientOcclusion, float roughness, float dotNV ) {
    return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}

float clearcoatDHRApprox(float roughness, float dotNL) {
    return 0.04 + 0.96 * ( pow( 1.0 - dotNL, 5.0 ) * pow( 1.0 - roughness, 2.0 ) );
}

PhysicalMaterial getPhysicalMaterial(
    vec4 diffuseColor,
    float metal,
    float roughness,
    vec3 specularColor,
    float glossiness,
    float alphaCutoff
    ){
        PhysicalMaterial material;

        #ifdef HAS_BASECOLORMAP
            vec4 baseColor = texture2D(u_baseColorSampler, v_uv);
            #ifndef OASIS_COLORSPACE_GAMMA
                baseColor = gammaToLinear(baseColor);
            #endif
            diffuseColor *= baseColor;
        #endif

        #ifdef O3_HAS_VERTEXCOLOR
            diffuseColor *= v_color;
        #endif


        #ifdef ALPHA_CUTOFF
            if( diffuseColor.a < alphaCutoff ) {
                discard;
            }
        #endif

        #ifdef HAS_METALROUGHNESSMAP
            vec4 metalRoughMapColor = texture2D( u_metallicRoughnessSampler, v_uv );
            roughness *= metalRoughMapColor.g;
            metal *= metalRoughMapColor.b;
        #endif

        #ifdef HAS_SPECULARGLOSSINESSMAP
            vec4 specularGlossinessColor = texture2D(u_specularGlossinessSampler, v_uv );
            specularColor *= specularGlossinessColor.rgb;
            glossiness *= specularGlossinessColor.a;
        #endif


        #ifdef IS_METALLIC_WORKFLOW
            material.diffuseColor = diffuseColor.rgb * ( 1.0 - metal );
            material.specularColor = mix( vec3( 0.04), diffuseColor.rgb, metal );
            material.roughness = clamp( roughness, 0.04, 1.0 );
        #else
            float specularStrength = max( max( specularColor.r, specularColor.g ), specularColor.b );
            material.diffuseColor = diffuseColor.rgb * ( 1.0 - specularStrength );
            material.specularColor = specularColor;
            material.roughness = clamp( 1.0 - glossiness, 0.04, 1.0 );
        #endif

        #ifdef CLEARCOAT
             material.clearcoat = u_clearcoat;
             material.clearcoatRoughness = u_clearcoatRoughness;
             #ifdef HAS_CLEARCOATTEXTURE
                 material.clearcoat *= texture2D( u_clearcoatTexture, v_uv ).r;
             #endif
             #ifdef HAS_CLEARCOATROUGHNESSTEXTURE
                 material.clearcoatRoughness *= texture2D( u_clearcoatRoughnessTexture, v_uv ).g;
             #endif
             material.clearcoat = saturate( material.clearcoat );
             material.clearcoatRoughness = clamp( material.clearcoatRoughness, 0.005, 1.0 );
        #endif


        material.opacity = diffuseColor.a;
        return material;

}

// direct + indirect
#include <brdf>
#include <direct_irradiance_frag_define>
#include <ibl_frag_define>