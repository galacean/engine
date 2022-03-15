// ------------------------Diffuse------------------------

// sh need be pre-scaled in CPU.
vec3 getLightProbeIrradiance(vec3 sh[9], vec3 normal){
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

// ------------------------Specular------------------------

// ref: https://www.unrealengine.com/blog/physically-based-shading-on-mobile - environmentBRDF for GGX on mobile
vec3 envBRDFApprox(vec3 specularColor,float roughness, float dotNV ) {

    const vec4 c0 = vec4( - 1, - 0.0275, - 0.572, 0.022 );

    const vec4 c1 = vec4( 1, 0.0425, 1.04, - 0.04 );

    vec4 r = roughness * c0 + c1;

    float a004 = min( r.x * r.x, exp2( - 9.28 * dotNV ) ) * r.x + r.y;

    vec2 AB = vec2( -1.04, 1.04 ) * a004 + r.zw;

    return specularColor * AB.x + AB.y;

}


float getSpecularMIPLevel(float roughness, int maxMIPLevel ) {
    return roughness * float(maxMIPLevel);
}

vec3 getLightProbeRadiance(vec3 viewDir, vec3 normal, float roughness, int maxMIPLevel, float specularIntensity) {

    #ifndef O3_USE_SPECULAR_ENV

        return vec3(0);

    #else

        vec3 reflectVec = reflect( -viewDir, normal );
        
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

#ifdef SHEEN
    // https://drive.google.com/file/d/1T0D1VSyR4AllqIJTQAraEIzjlb5h4FKH
	float envBRDFApprox_Sheen( float dotNV, float roughness) {
   		 float r2 = pow2(roughness);
   		 float a = roughness < 0.25 ? -339.2 * r2 + 161.4 * roughness - 25.9 : -8.48 * r2 + 14.3 * roughness - 9.95;
   		 float b = roughness < 0.25 ? 44.0 * r2 - 23.7 * roughness + 3.26 : 1.97 * r2 - 3.27 * roughness + 0.72;
   		 float DG = exp( a * dotNV + b ) + ( roughness < 0.25 ? 0.0 : 0.1 * ( roughness - 0.25 ) );
   		 return saturate( DG );
	}
#endif