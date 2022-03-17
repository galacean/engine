vec3 F_Schlick(vec3 f0, float f90, float dotVH) {
    return f0 + (f90 - f0) * pow(1.0 - dotVH, 5.0);
}

float F_Schlick(float f0, float f90, float dotVH) {
    return f0 + (f90 - f0) * pow(1.0 - dotVH, 5.0);
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

// Microfacet Models for Refraction through Rough Surfaces - equation (33)
// http://graphicrants.blogspot.com/2013/08/specular-brdf-reference.html
// alpha is "roughness squared" in Disney’s reparameterization
float D_GGX(float alpha, float dotNH ) {

	float a2 = pow2( alpha );

	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0; // avoid alpha = 0 with dotNH = 1

	return RECIPROCAL_PI * a2 / pow2( denom );

}

// GGX Distribution, Schlick Fresnel, GGX-Smith Visibility
vec3 BRDF_Specular_GGX(vec3 incidentDirection, vec3 viewDir, vec3 normal, vec3 f0, float f90, float roughness ) {

	float alpha = pow2( roughness ); // UE4's roughness

	vec3 halfDir = normalize( incidentDirection + viewDir );

	float dotNL = saturate( dot( normal, incidentDirection ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotLH = saturate( dot( incidentDirection, halfDir ) );

	vec3 F = F_Schlick( f0, f90, dotLH );

	float G = G_GGX_SmithCorrelated( alpha, dotNL, dotNV );

	float D = D_GGX( alpha, dotNH );

	return F * ( G * D );

}

vec3 BRDF_Diffuse_Lambert(vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}


#ifdef SHEEN
	float D_Charlie(float roughness, float NoH) {
		float alpha = pow2( roughness );
    	// Estevez and Kulla 2017, "Production Friendly Microfacet Sheen BRDF"
    	float invAlpha  = 1.0 / roughness;
    	float cos2h = NoH * NoH;
    	float sin2h = max(1.0 - cos2h, 0.0078125); // 2^(-14/2), so sin2h^2 > 0 in fp16

    	return (2.0 + invAlpha) * pow(sin2h, invAlpha * 0.5) / (2.0 * PI);
	}

	float V_Neubelt(float NoV, float NoL) {
    	// Neubelt and Pettineo 2013, "Crafting a Next-gen Material Pipeline for The Order: 1886"
    	return saturate(1.0 / (4.0 * (NoL + NoV - NoL * NoV)));
	}

    vec3 BRDF_Specular_Sheen(vec3 lightDir, Geometry geometry, vec3 sheenColor, float sheenRoughness ) {
        vec3 halfDir = normalize( lightDir + geometry.viewDir );
        float dotNL = saturate( dot( geometry.normal, lightDir ) );
        float dotNH = saturate( dot( geometry.normal, halfDir ) );
        float D = D_Charlie( sheenRoughness, dotNH );
        float V = V_Neubelt( geometry.dotNV, dotNL );

        return sheenColor * ( D * V );
    }
#endif