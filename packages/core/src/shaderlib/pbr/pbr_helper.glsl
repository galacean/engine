vec4 SRGBtoLINEAR(vec4 srgbIn)
{
    #ifdef MANUAL_SRGB
        #ifdef SRGB_FAST_APPROXIMATION
            vec3 linOut = pow(srgbIn.xyz, vec3(2.2));
        #else
            vec3 bLess = step(vec3(0.04045), srgbIn.xyz);
            vec3 linOut = mix(srgbIn.xyz/vec3(12.92), pow((srgbIn.xyz+vec3(0.055))/vec3(1.055), vec3(2.4)), bLess);
        #endif

        return vec4(linOut, srgbIn.w);;
    #else
        return srgbIn;
    #endif
}

float pow2( const in float x ) {
    return x * x;
}


vec3 BRDF_Diffuse_Lambert( const in vec3 diffuseColor ) {

	return RECIPROCAL_PI * diffuseColor;

}


float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {

    return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );

}


// direct + indirect
#include <brdf>
#include <direct_irradiance_frag_define>
#include <ibl_frag_define>