vec4 SRGBtoLINEAR(vec4 srgbIn)
{

    vec3 bLess = step(vec3(0.04045), srgbIn.rgb);
    vec3 linOut = mix(srgbIn.rgb / vec3(12.92), pow((srgbIn.rgb + vec3(0.055))/vec3(1.055), vec3(2.4)), bLess);


    return vec4(linOut, srgbIn.a);;

}

float pow2( const in float x ) {
    return x * x;
}

vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
    return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
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
