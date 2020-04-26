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

#ifdef O3_HAS_ENVMAP_LIGHT

vec3 getLightProbeIndirectRadiance( /*const in SpecularLightProbe specularLightProbe,*/ const in GeometricContext geometry, const in float blinnShininessExponent, const in int maxMIPLevel ) {

    #if !defined(O3_USE_SPECULAR_ENV) && !defined(HAS_REFLECTIONMAP)

        return u_envMapLight.specular * u_envMapLight.specularIntensity * u_envMapIntensity;

    #else

    #ifdef ENVMAPMODE_REFRACT

        vec3 reflectVec = refract( -geometry.viewDir, geometry.normal, u_refractionRatio );

    #else

        vec3 reflectVec = reflect( -geometry.viewDir, geometry.normal );

    #endif
//        reflectVec = inverseTransformDirection( reflectVec, u_viewMat );
        float specularMIPLevel = getSpecularMIPLevel( blinnShininessExponent, maxMIPLevel );

        #ifdef HAS_TEX_LOD
            #ifdef HAS_REFLECTIONMAP
                 vec4 envMapColor = textureCubeLodEXT( u_reflectionSampler, reflectVec, specularMIPLevel );
            #else
                vec4 envMapColor = textureCubeLodEXT( u_env_specularSampler, reflectVec, specularMIPLevel );
            #endif

        #else
            #ifdef HAS_REFLECTIONMAP
                 vec4 envMapColor = textureCube( u_reflectionSampler, reflectVec, specularMIPLevel );
            #else
                 vec4 envMapColor = textureCube( u_env_specularSampler, reflectVec, specularMIPLevel );
            #endif
        #endif

        envMapColor.rgb = SRGBtoLINEAR( envMapColor * u_envMapLight.specularIntensity * u_envMapIntensity).rgb;

        return envMapColor.rgb;

    #endif

}
#endif

void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 clearCoatRadiance, const in GeometricContext geometry, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {

    float dotNV = saturate( dot( geometry.normal, geometry.viewDir ) );
    float dotNL = dotNV;
    float clearCoatDHR = material.clearCoat * clearCoatDHRApprox( material.clearCoatRoughness, dotNL );

	reflectedLight.indirectSpecular += ( 1.0 - clearCoatDHR ) * radiance * BRDF_Specular_GGX_Environment( geometry, material.specularColor, material.specularRoughness );
    reflectedLight.indirectSpecular += clearCoatRadiance * material.clearCoat * BRDF_Specular_GGX_Environment( geometry, vec3( DEFAULT_SPECULAR_COEFFICIENT ), material.clearCoatRoughness );

}
