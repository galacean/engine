#include <normal_get>


float pow2(float x ) {
    return x * x;
}

vec3 BRDF_Diffuse_Lambert(vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}


float computeSpecularOcclusion(float ambientOcclusion, float roughness, float dotNV ) {
    return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
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
            #ifndef OASIS_COLORSPACE_GAMMA
                specularGlossinessColor = gammaToLinear(specularGlossinessColor);
            #endif
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

        material.opacity = diffuseColor.a;
        return material;

}

// direct + indirect
#include <brdf>
#include <direct_irradiance_frag_define>
#include <ibl_frag_define>