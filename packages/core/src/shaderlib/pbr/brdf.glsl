
#ifdef MATERIAL_ENABLE_SHEEN
    uniform sampler2D scene_PrefilteredDFG;
#endif

float F_Schlick(float f0, float dotLH) {
	return f0 + 0.96 * (pow(1.0 - dotLH, 5.0));
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

#ifdef MATERIAL_ENABLE_ANISOTROPY
    // Heitz 2014, "Understanding the Masking-Shadowing Function in Microfacet-Based BRDFs"
    // Heitz http://jcgt.org/published/0003/02/03/paper.pdf
    float G_GGX_SmithCorrelated_Anisotropic(float at, float ab, float ToV, float BoV, float ToL, float BoL, float NoV, float NoL) {
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

#ifdef MATERIAL_ENABLE_SHEEN
    // http://www.aconty.com/pdf/s2017_pbs_imageworks_sheen.pdf
    float D_Charlie(float roughness, float dotNH) {
        float invAlpha  = 1.0 / roughness;
        float cos2h = dotNH * dotNH;
        float sin2h = max(1.0 - cos2h, 0.0078125); // 2^(-14/2), so sin2h^2 > 0 in fp16
        return (2.0 + invAlpha) * pow(sin2h, invAlpha * 0.5) / (2.0 * PI);
    }

    // Neubelt and Pettineo 2013, "Crafting a Next-gen Material Pipeline for The Order: 1886".
    float V_Neubelt(float NoV, float NoL) {
        return saturate(1.0 / (4.0 * (NoL + NoV - NoL * NoV)));
    }

    vec3 sheenBRDF(vec3 incidentDirection, Geometry geometry, vec3 sheenColor, float sheenRoughness) {
        vec3 halfDir = normalize(incidentDirection + geometry.viewDir);
        float dotNL = saturate(dot(geometry.normal, incidentDirection));
        float dotNH = saturate(dot(geometry.normal, halfDir));
        float D = D_Charlie(sheenRoughness, dotNH);
        float V = V_Neubelt(geometry.dotNV, dotNL);
        vec3 F = sheenColor;
        return  D * V * F;
    }

    float prefilteredSheenDFG(float dotNV, float sheenRoughness) {
        #ifdef HAS_TEX_LOD
            return texture2DLodEXT(scene_PrefilteredDFG, vec2(dotNV, sheenRoughness), 0.0).b;
        #else
            return texture2D(scene_PrefilteredDFG, vec2(dotNV, sheenRoughness),0.0).b;
        #endif  
    }
#endif

#ifdef MATERIAL_ENABLE_ANISOTROPY
    // GGX Distribution Anisotropic
    // https://blog.selfshadow.com/publications/s2012-shading-course/burley/s2012_pbs_disney_brdf_notes_v3.pdf Addenda
    float D_GGX_Anisotropic(float at, float ab, float ToH, float BoH, float NoH) {
        float a2 = at * ab;
        vec3 d = vec3(ab * ToH, at * BoH, a2 * NoH);
        float d2 = dot(d, d);
        float b2 = a2 / d2;
        return a2 * b2 * b2 * RECIPROCAL_PI;
    }
#endif

vec3 isotropicLobe(vec3 specularColor, float alpha, float dotNV, float dotNL, float dotNH, float dotLH) {
	vec3 F = F_Schlick( specularColor, dotLH );
	float D = D_GGX( alpha, dotNH );
	float G = G_GGX_SmithCorrelated( alpha, dotNL, dotNV );

	return F * ( G * D );
}

#ifdef MATERIAL_ENABLE_ANISOTROPY
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

        // Aniso parameter remapping
        // https://blog.selfshadow.com/publications/s2017-shading-course/imageworks/s2017_pbs_imageworks_slides_v2.pdf page 24
        float at = max(alpha * (1.0 + geometry.anisotropy), MIN_ROUGHNESS);
        float ab = max(alpha * (1.0 - geometry.anisotropy), MIN_ROUGHNESS);

        // specular anisotropic BRDF
    	vec3 F = F_Schlick( specularColor, dotLH );
        float D = D_GGX_Anisotropic(at, ab, dotTH, dotBH, dotNH);
        float G = G_GGX_SmithCorrelated_Anisotropic(at, ab, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL);

        return F * ( G * D );
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
