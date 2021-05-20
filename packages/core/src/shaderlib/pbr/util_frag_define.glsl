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

vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
    return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
}

// todo: enhance
float punctualLightIntensityToIrradianceFactor( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {

    if( decayExponent > 0.0 ) {
        return pow( saturate( -lightDistance / cutoffDistance + 1.0 ), decayExponent );
    }

    return 1.0;

}

vec3 BRDF_Diffuse_Lambert( const in vec3 diffuseColor ) {

	return RECIPROCAL_PI * diffuseColor;

}

// source: http://simonstechblog.blogspot.ca/2011/12/microfacet-brdf.html
float GGXRoughnessToBlinnExponent( const in float ggxRoughness ) {
    return ( 2.0 / pow2( ggxRoughness + 0.0001 ) - 2.0 );
}


float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {

    return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );

}

// Luminance.
float getLuminance(vec3 color)
{
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
}
