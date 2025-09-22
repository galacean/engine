
#ifdef MATERIAL_ENABLE_SHEEN
    uniform sampler2D scene_PrefilteredDFG;
#endif

float F_Schlick(float f0, float f90, float dotLH) {
	return f0 + (f90 - f0) * (pow(1.0 - dotLH, 5.0));
}

vec3 F_Schlick(vec3 f0, float f90, float dotLH ) {

	// Original approximation by Christophe Schlick '94
	// float fresnel = pow( 1.0 - dotLH, 5.0 );

	// Optimized variant (presented by Epic at SIGGRAPH '13)
	// https://cdn2.unrealengine.com/Resources/files/2013SiggraphPresentationsNotes-26915738.pdf
	float fresnel = exp2( ( -5.55473 * dotLH - 6.98316 ) * dotLH );

	return (f90 - f0 ) * fresnel + f0;

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

float DG_GGX(float alpha, float dotNV, float dotNL, float dotNH) {
	float D = D_GGX( alpha, dotNH );
	float G = G_GGX_SmithCorrelated( alpha, dotNL, dotNV );
    return G * D;
}

#ifdef MATERIAL_ENABLE_ANISOTROPY
    float DG_GGX_anisotropic(vec3 h, vec3 l, Geometry geometry, float alpha, float dotNV, float dotNL, float dotNH) {
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
        float D = D_GGX_Anisotropic(at, ab, dotTH, dotBH, dotNH);
        float G = G_GGX_SmithCorrelated_Anisotropic(at, ab, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL);

        return G * D;
    }
#endif

#ifdef MATERIAL_ENABLE_IRIDESCENCE
    vec3 iorToFresnel0(vec3 transmittedIOR, float incidentIOR) {
        return pow((transmittedIOR - incidentIOR) / (transmittedIOR + incidentIOR),vec3(2.0));
    } 

    float iorToFresnel0(float transmittedIOR, float incidentIOR) {
        return pow((transmittedIOR - incidentIOR) / (transmittedIOR + incidentIOR),2.0);
    } 

    // Assume air interface for top
    // Note: We don't handle the case fresnel0 == 1
    vec3 fresnelToIOR(vec3 f0){
        vec3 sqrtF0 = sqrt(f0);
        return (vec3(1.0) + sqrtF0) / (vec3(1.0) - sqrtF0);
    }

    // Fresnel equations for dielectric/dielectric interfaces.
    // Ref: https://belcour.github.io/blog/research/publication/2017/05/01/brdf-thin-film.html
    // Evaluation XYZ sensitivity curves in Fourier space
    vec3 evalSensitivity(float opd, vec3 shift){
        // Use Gaussian fits, given by 3 parameters: val, pos and var
        float phase = 2.0 * PI * opd * 1.0e-9;
        const vec3 val = vec3(5.4856e-13, 4.4201e-13, 5.2481e-13);
        const vec3 pos = vec3(1.6810e+06, 1.7953e+06, 2.2084e+06);
        const vec3 var = vec3(4.3278e+09, 9.3046e+09, 6.6121e+09);
        vec3 xyz = val * sqrt(2.0 * PI * var) * cos(pos * phase + shift) * exp(-var * pow2(phase));
        xyz.x += 9.7470e-14 * sqrt(2.0 * PI * 4.5282e+09) * cos(2.2399e+06 * phase + shift[0]) * exp(-4.5282e+09 * pow2(phase));
        xyz /= 1.0685e-7;
        // XYZ to RGB color space
        const mat3 XYZ_TO_RGB = mat3( 3.2404542, -0.9692660,  0.0556434,
                                     -1.5371385,  1.8760108, -0.2040259,
                                     -0.4985314,  0.0415560,  1.0572252);
        vec3 rgb = XYZ_TO_RGB * xyz;
        return rgb;
    }

    vec3 evalIridescenceSpecular(float outsideIOR, float dotNV, float thinIOR, vec3 baseF0, float baseF90, float iridescenceThickness){ 
        vec3 iridescence = vec3(1.0);
        // Force iridescenceIOR -> outsideIOR when thinFilmThickness -> 0.0
        float iridescenceIOR = mix( outsideIOR, thinIOR, smoothstep( 0.0, 0.03, iridescenceThickness ) );
        // Evaluate the cosTheta on the base layer (Snell law)
        float sinTheta2Sq = pow( outsideIOR / iridescenceIOR, 2.0) * (1.0 - pow( dotNV, 2.0));
        float cosTheta2Sq = 1.0 - sinTheta2Sq;
        // Handle total internal reflection
        if (cosTheta2Sq < 0.0) {
           return iridescence;
        }
        float cosTheta2 = sqrt(cosTheta2Sq);
            
        // First interface
        float f0 = iorToFresnel0(iridescenceIOR, outsideIOR);
        float reflectance = F_Schlick(f0, baseF90, dotNV);
        float t121 = 1.0 - reflectance;
        float phi12 = 0.0;
        // iridescenceIOR has limited greater than 1.0
        // if (iridescenceIOR < outsideIOR) {phi12 = PI;} 
        float phi21 = PI - phi12;
        
        // Second interface
        vec3 baseIOR = fresnelToIOR(clamp(baseF0, 0.0, 0.9999)); // guard against 1.0
        vec3 r1  = iorToFresnel0(baseIOR, iridescenceIOR);
        vec3 r23 = F_Schlick(r1, baseF90, cosTheta2);
        vec3 phi23 =vec3(0.0);
        if (baseIOR[0] < iridescenceIOR) {phi23[0] = PI;}
        if (baseIOR[1] < iridescenceIOR) {phi23[1] = PI;}
        if (baseIOR[2] < iridescenceIOR) {phi23[2] = PI;}
        
        // Phase shift
        float opd = 2.0 * iridescenceIOR  * iridescenceThickness * cosTheta2;
        vec3 phi = vec3(phi21) + phi23;
        
        // Compound terms
        vec3 r123 = clamp(reflectance * r23, 1e-5, 0.9999);
        vec3 sr123 = sqrt(r123);
        vec3 rs = pow2(t121) * r23 / (vec3(1.0) - r123);
        // Reflectance term for m = 0 (DC term amplitude)
        vec3 c0 = reflectance + rs;
        iridescence = c0;
        // Reflectance term for m > 0 (pairs of diracs)
        vec3 cm = rs - t121;
        for (int m = 1; m <= 2; ++m) {
             cm *= sr123;
             vec3 sm = 2.0 * evalSensitivity(float(m) * opd, float(m) * phi);
             iridescence += cm * sm;
            }
        return iridescence = max(iridescence, vec3(0.0)); 
    }
#endif

// GGX Distribution, Schlick Fresnel, GGX-Smith Visibility
vec3 BRDF_Specular_GGX(vec3 incidentDirection, Geometry geometry, Material material, vec3 normal, vec3 specularColor, float roughness ) {

	float alpha = pow2( roughness ); // UE4's roughness

	vec3 halfDir = normalize( incidentDirection + geometry.viewDir );

	float dotNL = saturate( dot( normal, incidentDirection ) );
	float dotNV = saturate( dot( normal, geometry.viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotLH = saturate( dot( incidentDirection, halfDir ) );

    vec3 F = F_Schlick( specularColor, material.specularF90, dotLH );
    #ifdef MATERIAL_ENABLE_IRIDESCENCE
        F = mix(F, material.iridescenceSpecularColor, material.iridescenceFactor);
    #endif

    #ifdef MATERIAL_ENABLE_ANISOTROPY
        float GD = DG_GGX_anisotropic(halfDir, incidentDirection, geometry, alpha, dotNV, dotNL, dotNH);
    #else
        float GD = DG_GGX(alpha, dotNV, dotNL, dotNH);
    #endif

    return F * GD;
}

vec3 BRDF_Diffuse_Lambert(vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
