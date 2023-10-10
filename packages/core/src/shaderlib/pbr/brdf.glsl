float F_Schlick(float dotLH) {
	return 0.04 + 0.96 * (pow(1.0 - dotLH, 5.0));
}

vec3 F_Schlick(vec3 specularColor, float dotLH ) {

	// Original approximation by Christophe Schlick '94
	// float fresnel = pow( 1.0 - dotLH, 5.0 );

	// Optimized variant (presented by Epic at SIGGRAPH '13)
	// https://cdn2.unrealengine.com/Resources/files/2013SiggraphPresentationsNotes-26915738.pdf
	float fresnel = exp2( ( -5.55473 * dotLH - 6.98316 ) * dotLH );

	return ( 1.0 - specularColor ) * fresnel + specularColor;

}

// Moving Frostbite to Physically Based Rendering 3.0 - page 12, listing 2
// https://seblagarde.files.wordpress.com/2015/07/course_notes_moving_frostbite_to_pbr_v32.pdf
float G_GGX_SmithCorrelated(float alpha, float dotNL, float dotNV ) {

	float a2 = pow2( alpha );

	// dotNL and dotNV are explicitly swapped. This is not a mistake.
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );

	return 0.5 / max( gv + gl, EPSILON );

}

#if defined(MATERIAL_ENABLE_ANISOTROPY)
float G_GGX_SmithCorrelated_Anisotropic(float at, float ab, float ToV, float BoV,
        float ToL, float BoL, float NoV, float NoL) {
    // Heitz 2014, "Understanding the Masking-Shadowing Function in Microfacet-Based BRDFs"
    // TODO: lambdaV can be pre-computed for all the lights, it should be moved out of this function
    float lambdaV = NoL * length(vec3(at * ToV, ab * BoV, NoV));
    float lambdaL = NoV * length(vec3(at * ToL, ab * BoL, NoL));
    return 0.5 / max(lambdaV + lambdaL, EPSILON);
}
#endif

// Microfacet Models for Refraction through Rough Surfaces - equation (33)
// http://graphicrants.blogspot.com/2013/08/specular-brdf-reference.html
// alpha is "roughness squared" in Disney’s reparameterization
float D_GGX(float alpha, float dotNH ) {

	float a2 = pow2( alpha );

	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0; // avoid alpha = 0 with dotNH = 1

	return RECIPROCAL_PI * a2 / pow2( denom );

}

#if defined(MATERIAL_ENABLE_ANISOTROPY)
float D_GGX_Anisotropic(float at, float ab, float ToH, float BoH, float NoH) {
    // Burley 2012, "Physically-Based Shading at Disney"

    // The values at and ab are perceptualRoughness^2, a2 is therefore perceptualRoughness^4
    // The dot product below computes perceptualRoughness^8. We cannot fit in fp16 without clamping
    // the roughness to too high values so we perform the dot product and the division in fp32
    float a2 = at * ab;
    highp vec3 d = vec3(ab * ToH, at * BoH, a2 * NoH);
    highp float d2 = dot(d, d);
    float b2 = a2 / d2;
    return a2 * b2 * b2 * RECIPROCAL_PI;
}
#endif

vec3 isotropicLobe(vec3 specularColor, float alpha, float dotNV, float dotNL, float dotNH, float dotLH) {
	vec3 F = F_Schlick( specularColor, dotLH );

	float G = G_GGX_SmithCorrelated( alpha, dotNL, dotNV );

	float D = D_GGX( alpha, dotNH );

	return F * ( G * D );
}

#if defined(MATERIAL_ENABLE_ANISOTROPY)
vec3 anisotropicLobe(vec3 h, vec3 l, Geometry geometry, vec3 specularColor, float alpha, float dotNV, float dotNL, float dotNH, float dotLH) {
    vec3 t = geometry.anisotropicT;
    vec3 b = geometry.anisotropicB;
    vec3 v = geometry.viewDir;

    float dotTV = dot(t, v);
    float dotBV = dot(b, v);
    float dotTL = dot(t, l);
    float dotBL = dot(b, l);
    float dotTH = dot(t, h);
    float dotBH = dot(b, h);

    float MIN_ROUGHNESS = 0.007921; // mobile
    // Anisotropic parameters: at and ab are the roughness along the tangent and bitangent
    // to simplify materials, we derive them from a single roughness parameter
    // Kulla 2017, "Revisiting Physically Based Shading at Imageworks"
    float at = max(alpha * (1.0 + geometry.anisotropy), MIN_ROUGHNESS);
    float ab = max(alpha * (1.0 - geometry.anisotropy), MIN_ROUGHNESS);

    // specular anisotropic BRDF
    float D = D_GGX_Anisotropic(at, ab, dotTH, dotBH, dotNH);
    float V = G_GGX_SmithCorrelated_Anisotropic(at, ab, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL);
	vec3 F = F_Schlick( specularColor, dotLH );

    return (D * V) * F;
}
#endif

// GGX Distribution, Schlick Fresnel, GGX-Smith Visibility
vec3 BRDF_Specular_GGX(vec3 incidentDirection, Geometry geometry, vec3 normal, vec3 specularColor, float roughness ) {

	float alpha = pow2( roughness ); // UE4's roughness

	vec3 halfDir = normalize( incidentDirection + geometry.viewDir );

	float dotNL = saturate( dot( normal, incidentDirection ) );
	float dotNV = saturate( dot( normal, geometry.viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotLH = saturate( dot( incidentDirection, halfDir ) );

    #ifdef MATERIAL_ENABLE_ANISOTROPY
        return anisotropicLobe(halfDir, incidentDirection, geometry, specularColor, alpha, dotNV, dotNL, dotNH, dotLH);
    #else
        return isotropicLobe(specularColor, alpha, dotNV, dotNL, dotNH, dotLH);
    #endif

}

vec3 BRDF_Diffuse_Lambert(vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
