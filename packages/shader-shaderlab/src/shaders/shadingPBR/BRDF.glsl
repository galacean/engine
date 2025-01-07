
#ifndef BRDF_INCLUDED
#define BRDF_INCLUDED

#define MIN_PERCEPTUAL_ROUGHNESS 0.045
#define MIN_ROUGHNESS            0.002025

#if defined(RENDERER_HAS_TANGENT) || defined(MATERIAL_ENABLE_ANISOTROPY) || defined(MATERIAL_HAS_CLEAR_COAT_NORMAL_TEXTURE) || defined(MATERIAL_HAS_NORMALTEXTURE)
    #define NEED_TANGENT
#endif

#ifdef MATERIAL_ENABLE_SHEEN
    sampler2D scene_PrefilteredDFG;
#endif

struct SurfaceData{
    // common
	vec3  albedoColor;
    vec3  specularColor;
	vec3  emissiveColor;
    float metallic;
    float roughness;
    float diffuseAO;
    float specularAO;
    float f0;
    float opacity;
    float IOR;

    // geometry
    vec3 position;
    vec3 normal;

    #ifdef NEED_TANGENT
        vec3  tangent;
        vec3  bitangent;
    #endif

    vec3  viewDir;
    float dotNV;

    // Anisotropy
    #ifdef MATERIAL_ENABLE_ANISOTROPY
        float anisotropy;
        vec3  anisotropicT;
        vec3  anisotropicB;
        vec3  anisotropicN;
    #endif

    // Clear coat
    #ifdef MATERIAL_ENABLE_CLEAR_COAT
        float clearCoat;
        float clearCoatRoughness;
        vec3  clearCoatNormal;
        float clearCoatDotNV;
    #endif

    #ifdef MATERIAL_ENABLE_IRIDESCENCE
        float iridesceceIOR;
        float iridesceceFactor;
        float iridescenceThickness;
    #endif

    #ifdef MATERIAL_ENABLE_SHEEN
        float sheenRoughness;
        vec3  sheenColor;
    #endif

    #ifdef MATERIAL_ENABLE_TRANSMISSION 
        vec3 absorptionCoefficient;
        float transmission;
        float thickness;
    #endif
};


struct BRDFData{
    vec3  diffuseColor;
    vec3  specularColor;
    float roughness;
    vec3 envSpecularDFG;

    #ifdef MATERIAL_ENABLE_CLEAR_COAT
        vec3  clearCoatSpecularColor;
        float clearCoatRoughness;
    #endif

    #ifdef MATERIAL_ENABLE_IRIDESCENCE
        vec3  iridescenceSpecularColor;
    #endif

    #ifdef MATERIAL_ENABLE_SHEEN
        float sheenRoughness;
        float sheenScaling;
        float approxIBLSheenDG;
    #endif
    
};


float getAARoughnessFactor(vec3 normal) {
    // Kaplanyan 2016, "Stable specular highlights"
    // Tokuyoshi 2017, "Error Reduction and Simplification for Shading Anti-Aliasing"
    // Tokuyoshi and Kaplanyan 2019, "Improved Geometric Specular Antialiasing"
    #ifdef HAS_DERIVATIVES
        vec3 dxy = max( abs(dFdx(normal)), abs(dFdy(normal)) );
        return max( max(dxy.x, dxy.y), dxy.z );
    #else
        return 0.0;
    #endif
}


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

#ifdef MATERIAL_ENABLE_ANISOTROPY
    // GGX Distribution Anisotropic
    // https://blog.selfshadow.com/publications/s2012-shading-course/burley/s2012_pbs_disney_brdf_notes_v3.pdf Addenda
    float D_GGX_Anisotropic(float at, float ab, float ToH, float BoH, float NoH) {
        float a2 = at * ab;
        highp vec3 d = vec3(ab * ToH, at * BoH, a2 * NoH);
        highp float d2 = dot(d, d);
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
    float DG_GGX_anisotropic(vec3 h, vec3 l, SurfaceData surfaceData, float alpha, float dotNV, float dotNL, float dotNH) {
        vec3 t = surfaceData.anisotropicT;
        vec3 b = surfaceData.anisotropicB;
        vec3 v = surfaceData.viewDir;

        float dotTV = dot(t, v);
        float dotBV = dot(b, v);
        float dotTL = dot(t, l);
        float dotBL = dot(b, l);
        float dotTH = dot(t, h);
        float dotBH = dot(b, h);

        // Aniso parameter remapping
        // https://blog.selfshadow.com/publications/s2017-shading-course/imageworks/s2017_pbs_imageworks_slides_v2.pdf page 24
        float at = max(alpha * (1.0 + surfaceData.anisotropy), MIN_ROUGHNESS);
        float ab = max(alpha * (1.0 - surfaceData.anisotropy), MIN_ROUGHNESS);

        // specular anisotropic BRDF
        float D = D_GGX_Anisotropic(at, ab, dotTH, dotBH, dotNH);
        float G = G_GGX_SmithCorrelated_Anisotropic(at, ab, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL);

        return G * D;
    }
#endif

// GGX Distribution, Schlick Fresnel, GGX-Smith Visibility
vec3 BRDF_Specular_GGX(vec3 incidentDirection, SurfaceData surfaceData, BRDFData brdfData, vec3 normal, vec3 specularColor, float roughness ) {

	float alpha = pow2( roughness ); // UE4's roughness

	vec3 halfDir = normalize( incidentDirection + surfaceData.viewDir );

	float dotNL = saturate( dot( normal, incidentDirection ) );
    float dotNV = saturate( dot( normal, surfaceData.viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotLH = saturate( dot( incidentDirection, halfDir ) );

    vec3 F = F_Schlick( specularColor, dotLH );
    #ifdef MATERIAL_ENABLE_IRIDESCENCE
        F = mix(F, brdfData.iridescenceSpecularColor, surfaceData.iridesceceFactor);
    #endif
	

    #ifdef MATERIAL_ENABLE_ANISOTROPY
        float GD = DG_GGX_anisotropic(halfDir, incidentDirection, surfaceData, alpha, dotNV, dotNL, dotNH);
    #else
        float GD = DG_GGX(alpha, dotNV, dotNL, dotNH);
    #endif
    return F * GD;
}

vec3 BRDF_Diffuse_Lambert(vec3 diffuseColor) {
	return RECIPROCAL_PI * diffuseColor;
}

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

    vec3 evalIridescenceSpecular(float outsideIOR, float dotNV, float thinIOR, vec3 baseF0,float iridescenceThickness){ 
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
        float reflectance = F_Schlick(f0, dotNV);
        float t121 = 1.0 - reflectance;
        float phi12 = 0.0;
        // iridescenceIOR has limited greater than 1.0
        // if (iridescenceIOR < outsideIOR) {phi12 = PI;} 
        float phi21 = PI - phi12;
        
        // Second interface
        vec3 baseIOR = fresnelToIOR(clamp(baseF0, 0.0, 0.9999)); // guard against 1.0
        vec3 r1  = iorToFresnel0(baseIOR, iridescenceIOR);
        vec3 r23 = F_Schlick(r1, cosTheta2);
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

    vec3 sheenBRDF(vec3 incidentDirection, SurfaceData surfaceData, vec3 sheenColor, float sheenRoughness) {
        vec3 halfDir = normalize(incidentDirection + surfaceData.viewDir);
        float dotNL = saturate(dot(surfaceData.normal, incidentDirection));
        float dotNH = saturate(dot(surfaceData.normal, halfDir));
        float D = D_Charlie(sheenRoughness, dotNH);
        float V = V_Neubelt(surfaceData.dotNV, dotNL);
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

// ------------------------Indirect Specular------------------------
// ref: https://www.unrealengine.com/blog/physically-based-shading-on-mobile - environmentBRDF for GGX on mobile
vec3 envBRDFApprox(vec3 specularColor, float roughness, float dotNV ) {

    const vec4 c0 = vec4( - 1, - 0.0275, - 0.572, 0.022 );

    const vec4 c1 = vec4( 1, 0.0425, 1.04, - 0.04 );

    vec4 r = roughness * c0 + c1;

    float a004 = min( r.x * r.x, exp2( - 9.28 * dotNV ) ) * r.x + r.y;

    vec2 AB = vec2( -1.04, 1.04 ) * a004 + r.zw;

    return specularColor * AB.x + AB.y;

}


void initBRDFData(SurfaceData surfaceData, out BRDFData brdfData){
    vec3 albedoColor = surfaceData.albedoColor;
    vec3 specularColor = surfaceData.specularColor;
    float metallic = surfaceData.metallic;
    float roughness = surfaceData.roughness;
    float f0 = surfaceData.f0;

    #ifdef IS_METALLIC_WORKFLOW
        brdfData.diffuseColor = albedoColor * ( 1.0 - metallic );
        brdfData.specularColor = mix( vec3(f0), albedoColor, metallic );
    #else
        float specularStrength = max( max( specularColor.r, specularColor.g ), specularColor.b );
        brdfData.diffuseColor = albedoColor * ( 1.0 - specularStrength );
        brdfData.specularColor = specularColor;
    #endif
    brdfData.roughness = max(MIN_PERCEPTUAL_ROUGHNESS, min(roughness + getAARoughnessFactor(surfaceData.normal), 1.0));
    brdfData.envSpecularDFG = envBRDFApprox(brdfData.specularColor,  brdfData.roughness, surfaceData.dotNV);
   
    #ifdef MATERIAL_ENABLE_CLEAR_COAT
        brdfData.clearCoatRoughness = max(MIN_PERCEPTUAL_ROUGHNESS, min(surfaceData.clearCoatRoughness + getAARoughnessFactor(surfaceData.clearCoatNormal), 1.0));
        brdfData.clearCoatSpecularColor = vec3(0.04);
    #endif

    #ifdef MATERIAL_ENABLE_IRIDESCENCE
        float topIOR = 1.0;
        brdfData.iridescenceSpecularColor = evalIridescenceSpecular(topIOR, surfaceData.dotNV, surfaceData.iridesceceIOR, brdfData.specularColor, surfaceData.iridescenceThickness);   
    #endif

    #ifdef MATERIAL_ENABLE_SHEEN
        brdfData.sheenRoughness = max(MIN_PERCEPTUAL_ROUGHNESS, min(surfaceData.sheenRoughness + getAARoughnessFactor(surfaceData.normal), 1.0));
        brdfData.approxIBLSheenDG = prefilteredSheenDFG(surfaceData.dotNV, brdfData.sheenRoughness);
        brdfData.sheenScaling = 1.0 - brdfData.approxIBLSheenDG * max(max(surfaceData.sheenColor.r, surfaceData.sheenColor.g), surfaceData.sheenColor.b);
    #endif
}

#endif