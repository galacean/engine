
#ifndef LIGHT_DIRECT_PBR_INCLUDED
#define LIGHT_DIRECT_PBR_INCLUDED

#ifndef FUNCTION_SURFACE_SHADING
    #define FUNCTION_SURFACE_SHADING surfaceShading
#endif
#ifndef FUNCTION_DIFFUSE_LOBE
    #define FUNCTION_DIFFUSE_LOBE diffuseLobe
#endif
#ifndef FUNCTION_SPECULAR_LOBE
    #define FUNCTION_SPECULAR_LOBE specularLobe
#endif
#ifndef FUNCTION_CLEAR_COAT_LOBE
    #define FUNCTION_CLEAR_COAT_LOBE clearCoatLobe
#endif
#ifndef FUNCTION_SHEEN_LOBE
    #define FUNCTION_SHEEN_LOBE sheenLobe
#endif

#include "ShaderLibrary/PBR/BSDF.glsl"
#include "ShaderLibrary/Lighting/Light.glsl"
#include "ShaderLibrary/PBR/ReflectionLobe.glsl"

void surfaceShading(Varyings varyings, SurfaceData surfaceData, BSDFData bsdfData, vec3 incidentDirection, vec3 lightColor, inout vec3 totalDiffuseColor, inout vec3 totalSpecularColor) {

    vec3 diffuseColor = vec3(0);
    vec3 specularColor = vec3(0);
    float dotNL = saturate( dot( surfaceData.normal, incidentDirection ) );
    vec3 irradiance = dotNL * lightColor * PI;

    // ClearCoat Lobe
    float attenuation = FUNCTION_CLEAR_COAT_LOBE(varyings, surfaceData, bsdfData, incidentDirection, lightColor, specularColor);

    vec3 attenuationIrradiance = attenuation * irradiance;
    // Diffuse Lobe
    FUNCTION_DIFFUSE_LOBE(varyings, surfaceData, bsdfData, attenuationIrradiance, diffuseColor);
    // Specular Lobe
    FUNCTION_SPECULAR_LOBE(varyings, surfaceData, bsdfData, incidentDirection, attenuationIrradiance, specularColor);
    // Sheen Lobe
    FUNCTION_SHEEN_LOBE(varyings, surfaceData, bsdfData, incidentDirection, attenuationIrradiance, diffuseColor, specularColor);

    totalDiffuseColor += diffuseColor;
    totalSpecularColor += specularColor;

}

#ifdef SCENE_DIRECT_LIGHT_COUNT

    void addDirectionalDirectLightRadiance(Varyings varyings, SurfaceData surfaceData, BSDFData bsdfData, DirectLight directionalLight, inout vec3 totalDiffuseColor, inout vec3 totalSpecularColor) {
        vec3 lightColor = directionalLight.color;
        vec3 direction = -directionalLight.direction;

        FUNCTION_SURFACE_SHADING(varyings, surfaceData, bsdfData, direction, lightColor, totalDiffuseColor, totalSpecularColor);

    }

#endif

#ifdef SCENE_POINT_LIGHT_COUNT

	void addPointDirectLightRadiance(Varyings varyings, SurfaceData surfaceData, BSDFData bsdfData, PointLight pointLight, inout vec3 totalDiffuseColor, inout vec3 totalSpecularColor) {
		vec3 lVector = pointLight.position - surfaceData.position;
		vec3 direction = normalize( lVector );
		float lightDistance = length( lVector );

		vec3 lightColor = pointLight.color;
		lightColor *= clamp(1.0 - pow(lightDistance/pointLight.distance, 4.0), 0.0, 1.0);

        FUNCTION_SURFACE_SHADING(varyings, surfaceData, bsdfData, direction, lightColor, totalDiffuseColor, totalSpecularColor);
	}

#endif

#ifdef SCENE_SPOT_LIGHT_COUNT

	void addSpotDirectLightRadiance(Varyings varyings, SurfaceData surfaceData, BSDFData bsdfData, SpotLight spotLight, inout vec3 totalDiffuseColor, inout vec3 totalSpecularColor) {

		vec3 lVector = spotLight.position - surfaceData.position;
		vec3 direction = normalize( lVector );
		float lightDistance = length( lVector );
		float angleCos = dot( direction, -spotLight.direction );

		float spotEffect = smoothstep( spotLight.penumbraCos, spotLight.angleCos, angleCos );
		float decayEffect = clamp(1.0 - pow(lightDistance/spotLight.distance, 4.0), 0.0, 1.0);

		vec3 lightColor = spotLight.color;
		lightColor *= spotEffect * decayEffect;

        FUNCTION_SURFACE_SHADING(varyings, surfaceData, bsdfData, direction, lightColor, totalDiffuseColor, totalSpecularColor);

	}


#endif

void evaluateDirectRadiance(Varyings varyings, SurfaceData surfaceData, BSDFData bsdfData, float shadowAttenuation, inout vec3 totalDiffuseColor, inout vec3 totalSpecularColor){
    #ifdef SCENE_DIRECT_LIGHT_COUNT

        for ( int i = 0; i < SCENE_DIRECT_LIGHT_COUNT; i ++ ) {
            // warning: use `continue` syntax may trigger flickering bug in safri 16.1.
            if(!isRendererCulledByLight(renderer_Layer.xy, scene_DirectLightCullingMask[i])){
                    DirectLight directionalLight = getDirectLight(i);
                if (i == 0) { // Sun light index is always 0
                    directionalLight.color *= shadowAttenuation;
                }
                addDirectionalDirectLightRadiance(varyings, surfaceData, bsdfData, directionalLight, totalDiffuseColor, totalSpecularColor );
            }
        }

    #endif

    #ifdef SCENE_POINT_LIGHT_COUNT

        for ( int i = 0; i < SCENE_POINT_LIGHT_COUNT; i ++ ) {
            if(!isRendererCulledByLight(renderer_Layer.xy, scene_PointLightCullingMask[i])){
                    PointLight pointLight = getPointLight(i);
                addPointDirectLightRadiance(varyings, surfaceData, bsdfData, pointLight, totalDiffuseColor, totalSpecularColor);
            }
        }

    #endif

    #ifdef SCENE_SPOT_LIGHT_COUNT

        for ( int i = 0; i < SCENE_SPOT_LIGHT_COUNT; i ++ ) {
            if(!isRendererCulledByLight(renderer_Layer.xy, scene_SpotLightCullingMask[i])){
                    SpotLight spotLight = getSpotLight(i);
                addSpotDirectLightRadiance( varyings, surfaceData, bsdfData, spotLight, totalDiffuseColor, totalSpecularColor);
            }
        }

    #endif
}


#endif
