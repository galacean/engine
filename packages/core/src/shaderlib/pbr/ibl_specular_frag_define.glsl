// ref: https://www.unrealengine.com/blog/physically-based-shading-on-mobile - environmentBRDF for GGX on mobile
vec3 BRDF_Specular_GGX_Environment( const in GeometricContext geometry, const in vec3 specularColor, const in float roughness ) {

    float dotNV = saturate( dot( geometry.normal, geometry.viewDir ) );

    const vec4 c0 = vec4( - 1, - 0.0275, - 0.572, 0.022 );

    const vec4 c1 = vec4( 1, 0.0425, 1.04, - 0.04 );

    vec4 r = roughness * c0 + c1;

    float a004 = min( r.x * r.x, exp2( - 9.28 * dotNV ) ) * r.x + r.y;

    vec2 AB = vec2( -1.04, 1.04 ) * a004 + r.zw;

    return specularColor * AB.x + AB.y;

} // validated


// taken from here: http://casual-effects.blogspot.ca/2011/08/plausible-environment-lighting-in-two.html
float getSpecularMIPLevel( const in float blinnShininessExponent, const in int maxMIPLevel ) {

    //float envMapWidth = pow( 2.0, maxMIPLevelScalar );
    //float desiredMIPLevel = log2( envMapWidth * sqrt( 3.0 ) ) - 0.5 * log2( pow2( blinnShininessExponent ) + 1.0 );

    float maxMIPLevelScalar = float( maxMIPLevel );
    float desiredMIPLevel = maxMIPLevelScalar + 0.79248 - 0.5 * log2( pow2( blinnShininessExponent ) + 1.0 );

    // clamp to allowable LOD ranges.
    return clamp( desiredMIPLevel, 0.0, maxMIPLevelScalar );

}

vec3 getLightProbeIndirectRadiance( /*const in SpecularLightProbe specularLightProbe,*/ const in GeometricContext geometry, const in float blinnShininessExponent, const in int maxMIPLevel ) {

    #ifndef O3_USE_SPECULAR_ENV

        return vec3(0.0);

    #else

        vec3 reflectVec = reflect( -geometry.viewDir, geometry.normal );

        float specularMIPLevel = getSpecularMIPLevel( blinnShininessExponent, maxMIPLevel );

        #ifdef HAS_TEX_LOD
            vec4 envMapColor = textureCubeLodEXT( u_env_specularSampler, reflectVec, specularMIPLevel );
        #else
            vec4 envMapColor = textureCube( u_env_specularSampler, reflectVec, specularMIPLevel );
        #endif

        envMapColor.rgb = SRGBtoLINEAR( envMapColor * u_envMapLight.specularIntensity).rgb;

        return envMapColor.rgb;

    #endif

}

void RE_IndirectSpecular_Physical( const in vec3 radiance, const in GeometricContext geometry, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {

    float dotNV = saturate( dot( geometry.normal, geometry.viewDir ) );
    float dotNL = dotNV;

	reflectedLight.indirectSpecular += radiance * BRDF_Specular_GGX_Environment( geometry, material.specularColor, material.specularRoughness );

}
