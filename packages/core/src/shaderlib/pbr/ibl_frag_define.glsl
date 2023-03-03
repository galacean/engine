// sh need be pre-scaled in CPU.
vec3 getLightProbeIrradiance(vec3 sh[9], vec3 normal){
      normal.x = -normal.x;
      vec3 result = sh[0] +

            sh[1] * (normal.y) +
            sh[2] * (normal.z) +
            sh[3] * (normal.x) +

            sh[4] * (normal.y * normal.x) +
            sh[5] * (normal.y * normal.z) +
            sh[6] * (3.0 * normal.z * normal.z - 1.0) +
            sh[7] * (normal.z * normal.x) +
            sh[8] * (normal.x * normal.x - normal.y * normal.y);
    
    return max(result, vec3(0.0));

}

// ref: https://www.unrealengine.com/blog/physically-based-shading-on-mobile - environmentBRDF for GGX on mobile
vec2 lutApprox( float roughness, float dotNV ) {
    const vec4 c0 = vec4( - 1, - 0.0275, - 0.572, 0.022 );

    const vec4 c1 = vec4( 1, 0.0425, 1.04, - 0.04 );

    vec4 r = roughness * c0 + c1;

    float a004 = min( r.x * r.x, exp2( - 9.28 * dotNV ) ) * r.x + r.y;

    vec2 AB = vec2( -1.04, 1.04 ) * a004 + r.zw;

    return AB;
}

vec3 envBRDF(vec3 specularColor,float roughness, float dotNV ) {
    vec2 AB = lutApprox(roughness, dotNV);
    return specularColor * AB.x + AB.y;
}


float getSpecularMIPLevel(float roughness, int maxMIPLevel ) {
    return roughness * float(maxMIPLevel);
}

/**
 * Returns the reflected vector at the current shading point. The reflected vector
 * return by this function might be different from shading_reflected:
 * - For anisotropic material, we bend the reflection vector to simulate
 *   anisotropic indirect lighting
 * - The reflected vector may be modified to point towards the dominant specular
 *   direction to match reference renderings when the roughness increases
 */

vec3 getReflectedVector(Geometry geometry, const vec3 n, float roughness) {
    #if defined(HAS_ANISOTROPY)
        vec3  anisotropyDirection = geometry.anisotropy >= 0.0 ? geometry.anisotropicB : geometry.anisotropicT;
        vec3  anisotropicTangent  = cross(anisotropyDirection, geometry.viewDir);
        vec3  anisotropicNormal   = cross(anisotropicTangent, anisotropyDirection);
        float bendFactor          = abs(geometry.anisotropy) * saturate(5.0 * roughness);
        vec3  bentNormal          = normalize(mix(n, anisotropicNormal, bendFactor));
    
        vec3 r = reflect(-geometry.viewDir, bentNormal);
    #else
        vec3 r = reflect(-geometry.viewDir, n);
    #endif
    return r;
}

vec3 getLightProbeRadiance(Geometry geometry, vec3 normal, float roughness, int maxMIPLevel, float specularIntensity) {

    #ifndef O3_USE_SPECULAR_ENV

        return vec3(0);

    #else
        vec3 reflectVec = getReflectedVector(geometry, normal, roughness);
        reflectVec.x = -reflectVec.x; // TextureCube is left-hand,so x need inverse
        
        float specularMIPLevel = getSpecularMIPLevel(roughness, maxMIPLevel );

        #ifdef HAS_TEX_LOD
            vec4 envMapColor = textureCubeLodEXT( u_env_specularSampler, reflectVec, specularMIPLevel );
        #else
            vec4 envMapColor = textureCube( u_env_specularSampler, reflectVec, specularMIPLevel );
        #endif

        #ifdef O3_DECODE_ENV_RGBM
            envMapColor.rgb = RGBMToLinear(envMapColor, 5.0).rgb;
            #ifdef OASIS_COLORSPACE_GAMMA
                envMapColor = linearToGamma(envMapColor);
            #endif
        #else
             #ifndef OASIS_COLORSPACE_GAMMA
                envMapColor = gammaToLinear(envMapColor);
            #endif
        #endif
        
        return envMapColor.rgb * specularIntensity;

    #endif

}

void evaluateIBL(inout ReflectedLight reflectedLight, const Geometry geometry, const Material material ){
    #ifdef O3_USE_SH
        vec3 irradiance = getLightProbeIrradiance(u_env_sh, geometry.normal);
        #ifdef OASIS_COLORSPACE_GAMMA
            irradiance = linearToGamma(vec4(irradiance, 1.0)).rgb;
        #endif
        irradiance *= u_envMapLight.diffuseIntensity;
    #else
        vec3 irradiance = u_envMapLight.diffuse * u_envMapLight.diffuseIntensity;
        irradiance *= PI;
    #endif

    reflectedLight.indirectDiffuse += irradiance * BRDF_Diffuse_Lambert( material.diffuseColor );


    float radianceAttenuation = 1.0;
    #ifdef CLEARCOAT
        vec3 clearCoatRadiance = getLightProbeRadiance( geometry, geometry.clearCoatNormal, material.clearCoatRoughness, int(u_envMapLight.mipMapLevel), u_envMapLight.specularIntensity );

        reflectedLight.indirectSpecular += clearCoatRadiance * material.clearCoat * envBRDF(vec3( 0.04 ), material.clearCoatRoughness, geometry.clearCoatDotNV);
        radianceAttenuation -= material.clearCoat * F_Schlick(geometry.clearCoatDotNV);
    #endif

    vec3 radiance = radianceAttenuation * getLightProbeRadiance(geometry, geometry.normal, material.roughness, int(u_envMapLight.mipMapLevel), u_envMapLight.specularIntensity);
    vec2 fab = lutApprox( material.roughness, geometry.dotNV );
    vec3 FssEss = material.specularColor * fab.x + fab.y;
    reflectedLight.indirectSpecular += FssEss * radiance;

    // multi scattering
    float Ess = fab.x + fab.y;
    float Ems = 1.0 - Ess;
    vec3 Favg = material.specularColor + ( 1.0 - material.specularColor ) * 0.047619; // F0 + (1 - F0)/21;
    vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
    vec3 energyCompensation = Fms * Ems;
    vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;

    reflectedLight.indirectSpecular += energyCompensation * cosineWeightedIrradiance;

}
