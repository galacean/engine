#extension GL_EXT_shader_texture_lod: enable
#extension GL_OES_standard_derivatives : enable

#include <common>
#include <common_frag>

#include <fog_share>

#include <uv_share>
#include <normal_share>
#include <color_share>
#include <worldpos_share>

#ifdef ALPHA_MASK

    uniform float u_alphaCutoff;

#endif

#ifdef O3_HAS_ENVMAPLIGHT

    uniform float u_mipMapLevel;
    uniform float u_diffuseEnvSamplerIntensity;
    uniform float u_specularEnvSamplerIntensity;

    #ifdef O3_HAS_SPECULARMAP

        uniform samplerCube u_specularEnvSampler;

    #else

        uniform vec3 u_specular;

    #endif

    #ifdef O3_HAS_DIFFUSEMAP

        uniform samplerCube u_diffuseEnvSampler;

    #else

        uniform vec3 u_diffuse;

    #endif

#endif

uniform float u_envMapIntensity;
uniform float u_refractionRatio;



uniform vec3 u_lightDirection;
uniform vec3 u_lightColor;

uniform vec2 u_metallicRoughnessValue;
uniform vec4 u_baseColorFactor;

uniform vec3 u_specularFactor;
uniform float u_glossinessFactor;
#ifdef HAS_SPECULARGLOSSINESSMAP
    uniform sampler2D u_specularGlossinessSampler;
#endif

uniform float u_clearCoat;
uniform float u_clearCoatRoughness;

#ifdef HAS_BASECOLORMAP

    uniform sampler2D u_baseColorSampler;

#endif

#ifdef O3_HAS_NORMALMAP

    uniform sampler2D u_normalSampler;
    uniform float u_normalScale;

#endif

#ifdef HAS_EMISSIVEMAP

    uniform sampler2D u_emissiveSampler;
    uniform vec3 u_emissiveFactor;

#endif

#ifdef HAS_METALROUGHNESSMAP

    uniform sampler2D u_metallicRoughnessSampler;

#endif

#ifdef HAS_OCCLUSIONMAP

    uniform sampler2D u_occlusionSampler;
    uniform float u_occlusionStrength;

#endif

#ifdef HAS_OPACITYMAP

    uniform sampler2D u_opacitySampler;

#endif

uniform vec2 u_resolution;

// structures
struct IncidentLight {
    vec3 color;
    vec3 direction;
    bool visible;
};
struct ReflectedLight {
    vec3 directDiffuse;
    vec3 directSpecular;
    vec3 indirectDiffuse;
    vec3 indirectSpecular;
};
struct GeometricContext {
    vec3 position;
    vec3 normal;
    vec3 viewDir;
};
struct PhysicalMaterial {
    vec3	diffuseColor;
    float	 specularRoughness;
    vec3	specularColor;
    float    clearCoat;
    float    clearCoatRoughness;
};

vec4 SRGBtoLINEAR(vec4 srgbIn)
{
  #ifdef MANUAL_SRGB

    #ifdef SRGB_FAST_APPROXIMATION

        vec3 linOut = pow(srgbIn.xyz,vec3(2.2));

    #else

        vec3 bLess = step(vec3(0.04045),srgbIn.xyz);
        vec3 linOut = mix( srgbIn.xyz/vec3(12.92), pow((srgbIn.xyz+vec3(0.055))/vec3(1.055),vec3(2.4)), bLess );

    #endif

    return vec4(linOut,srgbIn.w);;

  #else

    return srgbIn;

  #endif
}

vec3 getNormal()
{
  #ifdef O3_HAS_NORMALMAP
    #ifndef O3_HAS_TANGENT
        #ifdef HAS_DERIVATIVES
            vec3 pos_dx = dFdx(v_pos);
            vec3 pos_dy = dFdy(v_pos);
            vec3 tex_dx = dFdx(vec3(getUv(), 0.0));
            vec3 tex_dy = dFdy(vec3(getUv(), 0.0));
            vec3 t = (tex_dy.t * pos_dx - tex_dx.t * pos_dy) / (tex_dx.s * tex_dy.t - tex_dy.s * tex_dx.t);
            #ifdef O3_HAS_NORMAL
                vec3 ng = normalize(v_normal);
            #else
                vec3 ng = cross(pos_dx, pos_dy);
            #endif
            t = normalize(t - ng * dot(ng, t));
            vec3 b = normalize(cross(ng, t));
            mat3 tbn = mat3(t, b, ng);
        #else
            #ifdef O3_HAS_NORMAL
                vec3 ng = normalize(v_normal);
            #else
                vec3 ng = vec3(0.0, 0.0, 1.0);
            #endif
            mat3 tbn = mat3(vec3(0.0), vec3(0.0), ng);
        #endif
    #else
        mat3 tbn = v_TBN;
    #endif
        vec3 n = texture2D(u_normalSampler, getUv() ).rgb;
        n = normalize(tbn * ((2.0 * n - 1.0) * vec3(u_normalScale, u_normalScale, 1.0)));
  #else
    #ifdef O3_HAS_NORMAL
        vec3 n = normalize(v_normal);
    #elif defined(HAS_DERIVATIVES)
        vec3 pos_dx = dFdx(v_pos);
        vec3 pos_dy = dFdy(v_pos);
        vec3 n= cross(pos_dx, pos_dy);
    #else
        vec3 n= vec3(0.0,0.0,1.0);
    #endif
  #endif

  #if defined( O3_DOUBLE_SIDE ) || defined(O3_BACK_SIDE)
        n *= float( gl_FrontFacing ) * 2.0 - 1.0;
  #endif

  return n;
}

vec2 getUv(){
  #ifdef  USE_SCREENUV
    return gl_FragCoord.xy/u_resolution;
  #else
    return v_uv;
  #endif

}


// Constance

#ifndef EPSILON
#define EPSILON 1e-6
#endif

#ifndef RECIPROCAL_PI
#define RECIPROCAL_PI 0.31830988618
#endif

float pow2( const in float x ) {
    return x*x;
}

vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
    return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
}

//- Constance

// BSDF

float punctualLightIntensityToIrradianceFactor( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {

	if( decayExponent > 0.0 ) {

        #if defined ( PHYSICALLY_CORRECT_LIGHTS )

            // based upon Frostbite 3 Moving to Physically-based Rendering
            // page 32, equation 26: E[window1]
            // https://seblagarde.files.wordpress.com/2015/07/course_notes_moving_frostbite_to_pbr_v32.pdf
            // this is intended to be used on spot and point lights who are represented as luminous intensity
            // but who must be converted to luminous irradiance for surface lighting calculation
            float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
            float maxDistanceCutoffFactor = pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
            return distanceFalloff * maxDistanceCutoffFactor;

        #else

        return pow( saturate( -lightDistance / cutoffDistance + 1.0 ), decayExponent );

        #endif

	}

	return 1.0;

}

vec3 F_Schlick( const in vec3 specularColor, const in float dotLH ) {

	// Original approximation by Christophe Schlick '94
	// float fresnel = pow( 1.0 - dotLH, 5.0 );

	// Optimized variant (presented by Epic at SIGGRAPH '13)
	// https://cdn2.unrealengine.com/Resources/files/2013SiggraphPresentationsNotes-26915738.pdf
	float fresnel = exp2( ( -5.55473 * dotLH - 6.98316 ) * dotLH );

	return ( 1.0 - specularColor ) * fresnel + specularColor;

} // validated

// Moving Frostbite to Physically Based Rendering 3.0 - page 12, listing 2
// https://seblagarde.files.wordpress.com/2015/07/course_notes_moving_frostbite_to_pbr_v32.pdf
float G_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {

	float a2 = pow2( alpha );

	// dotNL and dotNV are explicitly swapped. This is not a mistake.
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );

	return 0.5 / max( gv + gl, EPSILON );

}

// Microfacet Models for Refraction through Rough Surfaces - equation (33)
// http://graphicrants.blogspot.com/2013/08/specular-brdf-reference.html
// alpha is "roughness squared" in Disney’s reparameterization
float D_GGX( const in float alpha, const in float dotNH ) {

	float a2 = pow2( alpha );

	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0; // avoid alpha = 0 with dotNH = 1

	return RECIPROCAL_PI * a2 / pow2( denom );

}

// GGX Distribution, Schlick Fresnel, GGX-Smith Visibility
vec3 BRDF_Specular_GGX( const in IncidentLight incidentLight, const in GeometricContext geometry, const in vec3 specularColor, const in float roughness ) {

	float alpha = pow2( roughness ); // UE4's roughness

	vec3 halfDir = normalize( incidentLight.direction + geometry.viewDir );

	float dotNL = saturate( dot( geometry.normal, incidentLight.direction ) );
	float dotNV = saturate( dot( geometry.normal, geometry.viewDir ) );
	float dotNH = saturate( dot( geometry.normal, halfDir ) );
	float dotLH = saturate( dot( incidentLight.direction, halfDir ) );

	vec3 F = F_Schlick( specularColor, dotLH );

	float G = G_GGX_SmithCorrelated( alpha, dotNL, dotNV );

	float D = D_GGX( alpha, dotNH );

	return F * ( G * D );

} // validated

vec3 BRDF_Diffuse_Lambert( const in vec3 diffuseColor ) {

	return RECIPROCAL_PI * diffuseColor;

} // validated

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

// source: http://simonstechblog.blogspot.ca/2011/12/microfacet-brdf.html
float GGXRoughnessToBlinnExponent( const in float ggxRoughness ) {
	return ( 2.0 / pow2( ggxRoughness + 0.0001 ) - 2.0 );
}

//- BSDF

// ENV MAP

// taken from here: http://casual-effects.blogspot.ca/2011/08/plausible-environment-lighting-in-two.html
float getSpecularMIPLevel( const in float blinnShininessExponent, const in int maxMIPLevel ) {

    //float envMapWidth = pow( 2.0, maxMIPLevelScalar );
    //float desiredMIPLevel = log2( envMapWidth * sqrt( 3.0 ) ) - 0.5 * log2( pow2( blinnShininessExponent ) + 1.0 );

    float maxMIPLevelScalar = float( maxMIPLevel );
    float desiredMIPLevel = maxMIPLevelScalar + 0.79248 - 0.5 * log2( pow2( blinnShininessExponent ) + 1.0 );

    // clamp to allowable LOD ranges.
    return clamp( desiredMIPLevel, 0.0, maxMIPLevelScalar );

}

#ifdef O3_HAS_ENVMAPLIGHT
vec3 getLightProbeIndirectRadiance( /*const in SpecularLightProbe specularLightProbe,*/ const in GeometricContext geometry, const in float blinnShininessExponent, const in int maxMIPLevel ) {

    #ifndef O3_HAS_SPECULARMAP

        return u_specular * u_specularEnvSamplerIntensity * u_envMapIntensity;

    #else

    #ifdef ENVMAPMODE_REFRACT

        vec3 reflectVec = refract( -geometry.viewDir, geometry.normal, u_refractionRatio );

    #else

        vec3 reflectVec = reflect( -geometry.viewDir, geometry.normal );

    #endif
        reflectVec = inverseTransformDirection( reflectVec, u_viewMat );
        float specularMIPLevel = getSpecularMIPLevel( blinnShininessExponent, maxMIPLevel );

        #ifdef HAS_TEX_LOD

            vec4 envMapColor = textureCubeLodEXT( u_specularEnvSampler, reflectVec, specularMIPLevel );

        #else

            vec4 envMapColor = textureCube( u_specularEnvSampler, reflectVec, specularMIPLevel );

        #endif

        envMapColor.rgb = SRGBtoLINEAR( envMapColor * u_specularEnvSamplerIntensity * u_envMapIntensity).rgb;

        return envMapColor.rgb;

    #endif

}
#endif

//- ENV MAP

// PBR RenderEquations

#define MAXIMUM_SPECULAR_COEFFICIENT 0.16
#define DEFAULT_SPECULAR_COEFFICIENT 0.04

float clearCoatDHRApprox( const in float roughness, const in float dotNL ) {
    return DEFAULT_SPECULAR_COEFFICIENT + ( 1.0 - DEFAULT_SPECULAR_COEFFICIENT ) * ( pow( 1.0 - dotNL, 5.0 ) * pow( 1.0 - roughness, 2.0 ) );
}

void RE_Direct_Physical( const in IncidentLight directLight, const in GeometricContext geometry, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {

	float dotNL = saturate( dot( geometry.normal, directLight.direction ) );

	vec3 irradiance = dotNL * directLight.color;

	#ifndef PHYSICALLY_CORRECT_LIGHTS

		irradiance *= PI; // punctual light

	#endif


	float clearCoatDHR = material.clearCoat * clearCoatDHRApprox( material.clearCoatRoughness, dotNL );

	reflectedLight.directSpecular += ( 1.0 - clearCoatDHR ) * irradiance * BRDF_Specular_GGX( directLight, geometry, material.specularColor, material.specularRoughness );

	reflectedLight.directDiffuse += ( 1.0 - clearCoatDHR ) * irradiance * BRDF_Diffuse_Lambert( material.diffuseColor );

    reflectedLight.directSpecular += irradiance * material.clearCoat * BRDF_Specular_GGX( directLight, geometry, vec3( DEFAULT_SPECULAR_COEFFICIENT ), material.clearCoatRoughness );

}

void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in GeometricContext geometry, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {

	reflectedLight.indirectDiffuse += irradiance * BRDF_Diffuse_Lambert( material.diffuseColor );

}

void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 clearCoatRadiance, const in GeometricContext geometry, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {

    float dotNV = saturate( dot( geometry.normal, geometry.viewDir ) );
    float dotNL = dotNV;
    float clearCoatDHR = material.clearCoat * clearCoatDHRApprox( material.clearCoatRoughness, dotNL );

	reflectedLight.indirectSpecular += ( 1.0 - clearCoatDHR ) * radiance * BRDF_Specular_GGX_Environment( geometry, material.specularColor, material.specularRoughness );
    reflectedLight.indirectSpecular += clearCoatRadiance * material.clearCoat * BRDF_Specular_GGX_Environment( geometry, vec3( DEFAULT_SPECULAR_COEFFICIENT ), material.clearCoatRoughness );

}

#define RE_Direct				RE_Direct_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical

#define Material_BlinnShininessExponent( material )   GGXRoughnessToBlinnExponent( material.specularRoughness )
#define Material_ClearCoat_BlinnShininessExponent( material )   GGXRoughnessToBlinnExponent( material.clearCoatRoughness )

float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {

	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );

}

//- PBR RenderEquations

// Lights

uniform vec3 u_ambientLightColor;

vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {

    vec3 irradiance = ambientLightColor;

    #ifndef PHYSICALLY_CORRECT_LIGHTS

        irradiance *= PI;

    #endif

    return irradiance;

}

#ifdef O3_DIRECTLIGHT_NUM

    struct DirectionalLight {
        vec3 direction;
        vec3 color;
    };

    uniform DirectionalLight u_directionalLight[ O3_DIRECTLIGHT_NUM ];

    void getDirectionalDirectLightIrradiance( const in DirectionalLight directionalLight, const in GeometricContext geometry, out IncidentLight directLight ) {
        directLight.color = directionalLight.color;
        directLight.direction = directionalLight.direction;
        directLight.visible = true;
    }

#endif

#ifdef O3_POINTLIGHT_NUM

    struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};

	uniform PointLight u_pointLight[ O3_POINTLIGHT_NUM ];

	// directLight is an out parameter as having it as a return value caused compiler errors on some devices
	void getPointDirectLightIrradiance( const in PointLight pointLight, const in GeometricContext geometry, out IncidentLight directLight ) {

		vec3 lVector = pointLight.position - geometry.position;
		directLight.direction = normalize( lVector );

		float lightDistance = length( lVector );

		directLight.color = pointLight.color;
		directLight.color *= punctualLightIntensityToIrradianceFactor( lightDistance, pointLight.distance, pointLight.decay );
		directLight.visible = ( directLight.color != vec3( 0.0 ) );

	}

#endif

#ifdef O3_SPOTLIGHT_NUM

	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};

	uniform SpotLight u_spotLight[ O3_SPOTLIGHT_NUM ];

	// directLight is an out parameter as having it as a return value caused compiler errors on some devices
	void getSpotDirectLightIrradiance( const in SpotLight spotLight, const in GeometricContext geometry, out IncidentLight directLight  ) {

		vec3 lVector = spotLight.position - geometry.position;
		directLight.direction = normalize( lVector );

		float lightDistance = length( lVector );
		float angleCos = dot( directLight.direction, spotLight.direction );

		if ( angleCos > spotLight.coneCos ) {

			float spotEffect = smoothstep( spotLight.coneCos, spotLight.penumbraCos, angleCos );

			directLight.color = spotLight.color;
			directLight.color *= spotEffect * punctualLightIntensityToIrradianceFactor( lightDistance, spotLight.distance, spotLight.decay );
			directLight.visible = true;

		} else {

			directLight.color = vec3( 0.0 );
			directLight.visible = false;

		}
	}


#endif

//- Lights


// 亮度值
float getLuminance(vec3 color)
{
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

void main() {

    vec4 diffuseColor = u_baseColorFactor;
    ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
    vec3 totalEmissiveRadiance = vec3(0.0);

    #ifdef HAS_BASECOLORMAP

        vec4 baseMapColor = texture2D( u_baseColorSampler, getUv() );
        baseMapColor = SRGBtoLINEAR( baseMapColor );
        diffuseColor *= baseMapColor;

    #endif

    #ifdef O3_HAS_VERTEXCOLOR

        diffuseColor.rgb *= v_color.rgb;

        #ifdef O3_HAS_VERTEXALPHA

            diffuseColor.a *= v_color.a;

        #endif

    #endif

    #ifdef ALPHA_MASK

        if( diffuseColor.a < u_alphaCutoff ) {
            discard;
        }

    #endif

    #ifndef ALPHA_BLEND

        diffuseColor.a = 1.0;

    #endif

    #if defined(ALPHA_BLEND) && defined(HAS_OPACITYMAP)

        #ifdef GETOPACITYFROMRGB
            diffuseColor.a*=getLuminance(texture2D( u_opacitySampler, getUv() ).rgb);
        #else
            diffuseColor.a*=texture2D( u_opacitySampler, getUv() ).a;
        #endif

    #endif

    #ifdef UNLIT

        gl_FragColor = vec4( diffuseColor.rgb, diffuseColor.a );

    #else

        float metalnessFactor = u_metallicRoughnessValue.r;
        float roughnessFactor = u_metallicRoughnessValue.g;
        vec3 specularFactor = u_specularFactor;
        float glossinessFactor = u_glossinessFactor;

        #ifdef HAS_METALROUGHNESSMAP

            vec4 metalRoughMapColor = texture2D( u_metallicRoughnessSampler, getUv() );
            metalnessFactor *= metalRoughMapColor.b;
            roughnessFactor *= metalRoughMapColor.g;

        #endif

        #ifdef HAS_SPECULARGLOSSINESSMAP

            vec4 specularGlossinessColor = texture2D(u_specularGlossinessSampler, getUv() );
            specularFactor *= specularGlossinessColor.rgb;
            glossinessFactor *= specularGlossinessColor.a;

        #endif

        // start semulation
        PhysicalMaterial material;

        #ifdef IS_METALLIC_WORKFLOW
            material.diffuseColor = diffuseColor.rgb * ( 1.0 - metalnessFactor );
            material.specularRoughness = clamp( roughnessFactor, 0.04, 1.0 );
//          material.specularColor = mix( vec3( DEFAULT_SPECULAR_COEFFICIENT ), diffuseColor.rgb, metalnessFactor );
            material.specularColor = mix( vec3( MAXIMUM_SPECULAR_COEFFICIENT /* pow2( reflectivity )*/ ), diffuseColor.rgb, metalnessFactor );
        #else
            float specularStrength = max( max( specularFactor.r, specularFactor.g ), specularFactor.b );
            material.diffuseColor = diffuseColor.rgb * ( 1.0 - specularStrength );
            material.specularRoughness = clamp( 1.0 - glossinessFactor, 0.04, 1.0 );
            material.specularColor = specularFactor;
        #endif

        material.clearCoat = saturate( u_clearCoat );
        material.clearCoatRoughness = clamp( u_clearCoatRoughness, 0.04, 1.0 );

        GeometricContext geometry;
        geometry.position = v_pos;
        geometry.normal = getNormal();
        geometry.viewDir = normalize( u_cameraPos - v_pos );

        // lights

        IncidentLight directLight;

        #if defined( O3_DIRECTLIGHT_NUM ) && defined( RE_Direct )

            DirectionalLight directionalLight;

            for ( int i = 0; i < O3_DIRECTLIGHT_NUM; i ++ ) {

                directionalLight = u_directionalLight[ i ];

                getDirectionalDirectLightIrradiance( directionalLight, geometry, directLight );

                RE_Direct( directLight, geometry, material, reflectedLight );

            }

        #endif

        #if defined( O3_POINTLIGHT_NUM ) && defined( RE_Direct )

            PointLight pointLight;

            for ( int i = 0; i < O3_POINTLIGHT_NUM; i ++ ) {

                pointLight = u_pointLight[ i ];

                getPointDirectLightIrradiance( pointLight, geometry, directLight );

                RE_Direct( directLight, geometry, material, reflectedLight );

            }

        #endif

        #if defined( O3_SPOTLIGHT_NUM ) && defined( RE_Direct )

            SpotLight spotLight;

            for ( int i = 0; i < O3_SPOTLIGHT_NUM; i ++ ) {

                spotLight = u_spotLight[ i ];

                getSpotDirectLightIrradiance( spotLight, geometry, directLight );

                RE_Direct( directLight, geometry, material, reflectedLight );

            }

        #endif

        // light maps

        #if defined( RE_IndirectDiffuse )

            vec3 irradiance = getAmbientLightIrradiance( u_ambientLightColor );

        #endif

        #if defined( RE_IndirectSpecular )

            vec3 radiance = vec3( 0.0 );
            vec3 clearCoatRadiance = vec3( 0.0 );

        #endif

        #if defined( RE_IndirectDiffuse ) && defined( O3_HAS_ENVMAPLIGHT )

            #ifdef O3_HAS_DIFFUSEMAP

                vec3 lightMapIrradiance = textureCube(u_diffuseEnvSampler, geometry.normal).rgb * u_diffuseEnvSamplerIntensity;

            #else

                vec3 lightMapIrradiance = u_diffuse * u_diffuseEnvSamplerIntensity;

            #endif

            #ifndef PHYSICALLY_CORRECT_LIGHTS

                lightMapIrradiance *= PI;

            #endif

            irradiance += lightMapIrradiance;

        #endif

        #if defined( O3_HAS_ENVMAPLIGHT ) && defined( RE_IndirectSpecular )

            radiance += getLightProbeIndirectRadiance( geometry, Material_BlinnShininessExponent( material ), int(u_mipMapLevel) );
            clearCoatRadiance += getLightProbeIndirectRadiance( geometry, Material_ClearCoat_BlinnShininessExponent( material ), int(u_mipMapLevel) );

        #endif

        #if defined( RE_IndirectDiffuse )

            RE_IndirectDiffuse( irradiance, geometry, material, reflectedLight );

        #endif

        #if defined( RE_IndirectSpecular )

            RE_IndirectSpecular( radiance, clearCoatRadiance, geometry, material, reflectedLight );

        #endif

        #ifdef HAS_OCCLUSIONMAP

            float ambientOcclusion = ( texture2D( u_occlusionSampler, getUv() ).r - 1.0 ) * u_occlusionStrength + 1.0;
            reflectedLight.indirectDiffuse *= ambientOcclusion;

            #if defined( O3_HAS_SPECULARMAP )

                float dotNV = saturate( dot( geometry.normal, geometry.viewDir ) );
                reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.specularRoughness );

            #endif

        #endif

        #ifdef HAS_EMISSIVEMAP

            vec4 emissiveMapColor = texture2D( u_emissiveSampler, getUv() );
            emissiveMapColor = SRGBtoLINEAR( emissiveMapColor );
            totalEmissiveRadiance += u_emissiveFactor * emissiveMapColor.rgb;

        #endif

        vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
        gl_FragColor = vec4( outgoingLight, diffuseColor.a );

    #endif

    #ifdef PREMULTIPLIED_ALPHA
        gl_FragColor.rgb *= gl_FragColor.a;
    #endif

    #ifdef GAMMA
        float gamma = 2.2;
        gl_FragColor.rgb = pow(gl_FragColor.rgb, vec3(1.0/gamma));
    #endif

    #include <fog_frag>

}
