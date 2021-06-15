vec4 SRGBtoLinear(vec4 srgbIn)
{
    #ifdef SRGB_FAST_APPROXIMATION
        vec3 linOut = pow(srgbIn.xyz, vec3(2.2));
    #else
        vec3 bLess = step(vec3(0.04045), srgbIn.xyz);
        vec3 linOut = mix(srgbIn.xyz/vec3(12.92), pow((srgbIn.xyz+vec3(0.055))/vec3(1.055), vec3(2.4)), bLess);
    #endif

    return vec4(linOut, srgbIn.a);
}

vec4 RGBEToLinear(vec4 value) {
    return vec4( step(0.0, value.a) * value.rgb * exp2( value.a * 255.0 - 128.0 ), 1.0 );
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


float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {

    return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );

}

// Luminance.
float getLuminance(vec3 color)
{
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

// roughness anti-alias
float getAARoughnessFactor(vec3 normalVector) {
    #ifdef HAS_DERIVATIVES
        vec3 nDfdx = dFdx(normalVector);
        vec3 nDfdy = dFdy(normalVector);
        float slopeSquare = max(dot(nDfdx, nDfdx), dot(nDfdy, nDfdy));
        float geometricAlphaGFactor = sqrt(slopeSquare);
        geometricAlphaGFactor *= 0.75;
        return geometricAlphaGFactor;
    #endif

    return 0.0;
}