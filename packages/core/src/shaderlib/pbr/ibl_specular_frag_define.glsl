// ref: https://www.unrealengine.com/blog/physically-based-shading-on-mobile - environmentBRDF for GGX on mobile
vec2 integrateSpecularBRDF( const in float dotNV, const in float roughness ) {
    const vec4 c0 = vec4( - 1, - 0.0275, - 0.572, 0.022 );
    const vec4 c1 = vec4( 1, 0.0425, 1.04, - 0.04 );
    vec4 r = roughness * c0 + c1;
    float a004 = min( r.x * r.x, exp2( - 9.28 * dotNV ) ) * r.x + r.y;
    return vec2( -1.04, 1.04 ) * a004 + r.zw;
}

vec3 BRDF_Specular_GGX_Environment( const in GeometricContext geometry, const in vec3 specularColor, const in float roughness ) {

    float dotNV = saturate( dot( geometry.normal, geometry.viewDir ) );
    vec2 brdf = integrateSpecularBRDF( dotNV, roughness );

    return specularColor * brdf.x + brdf.y;

} // validated

void BRDF_Specular_Multiscattering_Environment( const in GeometricContext geometry, const in vec3 specularColor, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
    float dotNV = saturate( dot( geometry.normal, geometry.viewDir ) );
    vec3 F = F_Schlick_RoughnessDependent( specularColor, dotNV, roughness );
    vec2 brdf = integrateSpecularBRDF( dotNV, roughness );
    vec3 FssEss = F * brdf.x + brdf.y;
    float Ess = brdf.x + brdf.y;
    float Ems = 1.0 - Ess;
    vec3 Favg = specularColor + ( 1.0 - specularColor ) * 0.047619;
    vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );

    singleScatter += FssEss;
    multiScatter += Fms * Ems;
}

float getSpecularMIPLevel( const in float roughness, const in int maxMIPLevel ) {

	// float maxMIPLevelScalar = float( maxMIPLevel );

	// float sigma = PI * roughness * roughness / ( 1.0 + roughness );
	// float desiredMIPLevel = maxMIPLevelScalar + log2( sigma );

	// // clamp to allowable LOD ranges.
	// return clamp( desiredMIPLevel, 0.0, maxMIPLevelScalar );

    return roughness * float(maxMIPLevel) * 0.8;

}


vec3 getIndirectRadiance( const in GeometricContext geometry, const in float roughness, const in int maxMIPLevel ) {

    #if !defined(O3_USE_SPECULAR_ENV) && !defined(HAS_REFLECTIONMAP)

        return vec3(0.0);

    #else

        #ifdef ENVMAPMODE_REFRACT

            vec3 reflectVec = refract( -geometry.viewDir, geometry.normal, u_refractionRatio );

        #else

            vec3 reflectVec = reflect( -geometry.viewDir, geometry.normal );

        #endif

        float specularMIPLevel = getSpecularMIPLevel( roughness, maxMIPLevel );

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

        #ifdef ENV_RGBE
            envMapColor.rgb = RGBEToLinear( envMapColor).rgb;
        #elif defined(ENV_GAMMA)
            envMapColor.rgb = SRGBtoLinear( envMapColor).rgb;
        #endif
        
        return envMapColor.rgb * u_envMapLight.specularIntensity * u_envMapIntensity;

    #endif

}

void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 multiScatteringRadiance, const in GeometricContext geometry, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {

	// reflectedLight.indirectSpecular += radiance * BRDF_Specular_GGX_Environment( geometry, material.specularColor, material.specularRoughness );
    
    vec3 singleScattering = vec3( 0.0 );
    vec3 multiScattering = vec3( 0.0 );
    BRDF_Specular_Multiscattering_Environment( geometry, material.specularColor, material.specularRoughness, singleScattering, multiScattering );
    
    vec3 diffuse = material.diffuseColor * ( 1.0 - ( singleScattering + multiScattering ) );
    reflectedLight.indirectSpecular += radiance * singleScattering;
    reflectedLight.indirectSpecular += multiScattering * multiScatteringRadiance;
    reflectedLight.indirectDiffuse += diffuse * multiScatteringRadiance;
}
