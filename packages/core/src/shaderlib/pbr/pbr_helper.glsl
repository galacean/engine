#include <normal_get>

// direct + indirect
#include <brdf>
#include <direct_irradiance_frag_define>
#include <ibl_frag_define>

float computeSpecularOcclusion(float ambientOcclusion, float roughness, float dotNV ) {
    return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}

float getAARoughnessFactor(vec3 normal) {
    #ifdef HAS_DERIVATIVES
        vec3 dxy = max( abs(dFdx(normal)), abs(dFdy(normal)) );
        return max( max(dxy.x, dxy.y), dxy.z );
    #else
        return 0.0;
    #endif
}

float getSheenAlbedoScaling(vec3 sheenColor, float sheenEnvBRDF){
	return 1.0 - sheenEnvBRDF * max( max(sheenColor.r, sheenColor.g), sheenColor.b );
}

float getDielectricF0(float ior, float outsideIor){
    return pow2( (ior - outsideIor) / (ior + outsideIor) );
}

void initGeometry(out Geometry geometry){
    geometry.position = v_pos;
    geometry.viewDir =  normalize(u_cameraPos - v_pos);

    geometry.normal = getNormal( 
            #ifdef O3_NORMAL_TEXTURE
                u_normalTexture,
                u_normalIntensity
            #endif
    );

    #ifdef CLEARCOAT
        geometry.clearcoatNormal = getNormal(
              #ifdef HAS_CLEARCOATNORMALTEXTURE
                u_clearcoatNormalTexture,
                u_normalIntensity
            #endif
        );
        geometry.clearcoatDotNV = saturate( dot(geometry.clearcoatNormal, geometry.viewDir) );
    #endif

    geometry.dotNV = saturate( dot(geometry.normal, geometry.viewDir) );
}

void initMaterial(out Material material, const in Geometry geometry){
        vec4  baseColor = u_baseColor;
        float metal = u_metal;
        float roughness = u_roughness;
        vec3  specularColor = u_specularColor;
        float glossiness = u_glossiness;
        float alphaCutoff = u_alphaCutoff;
        float dielectricSpecularIntensity = u_dielectricSpecularIntensity;
        vec3  dielectricF0Color = u_dielectricF0Color;


        #ifdef HAS_BASECOLORMAP
            vec4 baseTextureColor = texture2D(u_baseColorSampler, v_uv);
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

        #ifdef HAS_DIELECTRICSPECULARINTENSITYTEXTURE
            dielectricSpecularIntensity *= texture2D(u_dielectricSpecularIntensityTexture, v_uv).a;
        #endif

        #ifdef HAS_DIELECTRICF0COLORTEXTURE
            vec4 dielectricF0ColorTextureValue = texture2D(u_dielectricF0ColorTexture, v_uv);
            #ifndef OASIS_COLORSPACE_GAMMA
                    dielectricF0ColorTextureValue = gammaToLinear(dielectricF0ColorTextureValue);
            #endif
            dielectricF0Color *= dielectricF0ColorTextureValue.rgb;
        #endif

        #ifdef IS_METALLIC_WORKFLOW
            vec3 dielectricF0 = min(getDielectricF0(u_ior, 1.0) * dielectricF0Color, vec3(dielectricSpecularIntensity));

            material.diffuseColor = baseColor.rgb * ( 1.0 - metal );
            material.specularColor = mix(dielectricF0, baseColor.rgb, metal);
            material.F90 = mix(dielectricSpecularIntensity, 1.0, metal);
            material.roughness = roughness;
        #else
            float specularStrength = max( max( specularColor.r, specularColor.g ), specularColor.b );
            material.diffuseColor = baseColor.rgb * ( 1.0 - specularStrength );
            material.specularColor = specularColor;
            material.F90 = 1.0;
            material.roughness = 1.0 - glossiness;
        #endif

        material.roughness = max(material.roughness, getAARoughnessFactor(geometry.normal));

        #ifdef REFRACTION
            float refractionIntensity = u_refractionIntensity;
            #ifdef HAS_REFRACTIONINTENSITYTEXTURE
                refractionIntensity *= texture2D(u_refractionIntensityTexture, v_uv).r;
            #endif
            material.diffuseColor *= 1.0 - refractionIntensity;
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
            material.clearcoatRoughness = max(material.clearcoatRoughness, getAARoughnessFactor(geometry.clearcoatNormal));
            material.clearcoatAttenuation = 1.0 - material.clearcoat * F_Schlick(0.04, 1.0, geometry.clearcoatDotNV);
        #else
            material.clearcoatAttenuation = 1.0;
        #endif

        #ifdef SHEEN
            material.sheenColor = u_sheenColor;

            #ifdef HAS_SHEENCOLORTEXTURE
                vec4 sheenColorTextureValue =  texture2D( u_sheenColorTexture, v_uv );
                #ifndef OASIS_COLORSPACE_GAMMA
                    sheenColorTextureValue = gammaToLinear(sheenColorTextureValue);
                #endif
                material.sheenColor *= sheenColorTextureValue.rgb;
            #endif

            material.sheenRoughness = max( u_sheenRoughness, 0.01 );

            #ifdef HAS_SHEENROUGHNESSTEXTURE
                material.sheenRoughness *= texture2D( u_sheenRoughnessTexture, v_uv ).a;
            #endif

            material.sheenEnvBRDF = envBRDFApprox_Sheen(geometry.dotNV, material.sheenRoughness );
            material.sheenAttenuation = getSheenAlbedoScaling(material.sheenColor, material.sheenEnvBRDF);
        #else
            material.sheenAttenuation = 1.0;
        #endif

        material.opacity = baseColor.a;
}