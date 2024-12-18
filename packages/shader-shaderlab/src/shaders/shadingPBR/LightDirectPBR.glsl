
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

#include "BRDF.glsl"
#include "BTDF.glsl"
#include "Light.glsl"
#include "ReflectionLobe.glsl"

void surfaceShading(Varyings varyings, SurfaceData surfaceData, BRDFData brdfData, vec3 incidentDirection, vec3 lightColor, inout vec3 color) {

    vec3 diffuseColor = vec3(0);
    vec3 specularColor = vec3(0);
    float dotNL = saturate( dot( surfaceData.normal, incidentDirection ) );
    vec3 irradiance = dotNL * lightColor * PI;

    // ClearCoat Lobe
    float attenuation = FUNCTION_CLEAR_COAT_LOBE(varyings, surfaceData, brdfData, incidentDirection, lightColor, specularColor);

    vec3 attenuationIrradiance = attenuation * irradiance;
    // Diffuse Lobe
    FUNCTION_DIFFUSE_LOBE(varyings, surfaceData, brdfData, attenuationIrradiance, diffuseColor);
    // Specular Lobe
    FUNCTION_SPECULAR_LOBE(varyings, surfaceData, brdfData, incidentDirection, attenuationIrradiance, specularColor);
     
    #ifdef MATERIAL_ENABLE_SS_REFRACTION 
        diffuseColor *= (1.0 - surfaceData.transmission);
    #endif

    // Sheen Lobe
    FUNCTION_SHEEN_LOBE(varyings, surfaceData, brdfData, incidentDirection, attenuationIrradiance, diffuseColor, specularColor);
    
    color += diffuseColor + specularColor;

}

#ifdef SCENE_DIRECT_LIGHT_COUNT

    void addDirectionalDirectLightRadiance(Varyings varyings, SurfaceData surfaceData, BRDFData brdfData, DirectLight directionalLight, inout vec3 color) {
        vec3 lightColor = directionalLight.color;
        vec3 direction = -directionalLight.direction;

        FUNCTION_SURFACE_SHADING(varyings, surfaceData, brdfData, direction, lightColor, color);

    }

#endif

#ifdef SCENE_POINT_LIGHT_COUNT

	void addPointDirectLightRadiance(Varyings varyings, SurfaceData surfaceData, BRDFData brdfData, PointLight pointLight, inout vec3 color) {
		vec3 lVector = pointLight.position - surfaceData.position;
		vec3 direction = normalize( lVector );
		float lightDistance = length( lVector );

		vec3 lightColor = pointLight.color;
		lightColor *= clamp(1.0 - pow(lightDistance/pointLight.distance, 4.0), 0.0, 1.0);

        FUNCTION_SURFACE_SHADING(varyings, surfaceData, brdfData, direction, lightColor, color);
	}

#endif

#ifdef SCENE_SPOT_LIGHT_COUNT

	void addSpotDirectLightRadiance(Varyings varyings, SurfaceData surfaceData, BRDFData brdfData, SpotLight spotLight, inout vec3 color) {

		vec3 lVector = spotLight.position - surfaceData.position;
		vec3 direction = normalize( lVector );
		float lightDistance = length( lVector );
		float angleCos = dot( direction, -spotLight.direction );

		float spotEffect = smoothstep( spotLight.penumbraCos, spotLight.angleCos, angleCos );
		float decayEffect = clamp(1.0 - pow(lightDistance/spotLight.distance, 4.0), 0.0, 1.0);

		vec3 lightColor = spotLight.color;
		lightColor *= spotEffect * decayEffect;

        FUNCTION_SURFACE_SHADING(varyings, surfaceData, brdfData, direction, lightColor, color);

	}


#endif

void evaluateDirectRadiance(Varyings varyings, SurfaceData surfaceData, BRDFData brdfData, float shadowAttenuation, inout vec3 color){
    #ifdef SCENE_DIRECT_LIGHT_COUNT

        for ( int i = 0; i < SCENE_DIRECT_LIGHT_COUNT; i ++ ) {
            // warning: use `continue` syntax may trigger flickering bug in safri 16.1.
            if(!isRendererCulledByLight(renderer_Layer.xy, scene_DirectLightCullingMask[i])){
                #ifdef GRAPHICS_API_WEBGL2
                    DirectLight directionalLight = getDirectLight(i);
                #else
                    DirectLight directionalLight;
                    directionalLight.color = scene_DirectLightColor[i];
                    directionalLight.direction = scene_DirectLightDirection[i];
                #endif
                
                #ifdef NEED_CALCULATE_SHADOWS
                    if (i == 0) { // Sun light index is always 0
                        directionalLight.color *= shadowAttenuation;
                    }
                #endif
                addDirectionalDirectLightRadiance(varyings, surfaceData, brdfData, directionalLight, color );
            }
        }

    #endif

    #ifdef SCENE_POINT_LIGHT_COUNT

        for ( int i = 0; i < SCENE_POINT_LIGHT_COUNT; i ++ ) {
            if(!isRendererCulledByLight(renderer_Layer.xy, scene_PointLightCullingMask[i])){
                #ifdef GRAPHICS_API_WEBGL2
                    PointLight pointLight = getPointLight(i);
                #else
                    PointLight pointLight;
                    pointLight.color = scene_PointLightColor[i];
                    pointLight.position = scene_PointLightPosition[i];
                    pointLight.distance = scene_PointLightDistance[i];
                #endif
                addPointDirectLightRadiance(varyings, surfaceData, brdfData, pointLight, color );
            } 
        }

    #endif

    #ifdef SCENE_SPOT_LIGHT_COUNT
      
        for ( int i = 0; i < SCENE_SPOT_LIGHT_COUNT; i ++ ) {
            if(!isRendererCulledByLight(renderer_Layer.xy, scene_SpotLightCullingMask[i])){
                #ifdef GRAPHICS_API_WEBGL2
                    SpotLight spotLight = getSpotLight(i);
                #else
                    SpotLight spotLight;
                    spotLight.color = scene_SpotLightColor[i];
                    spotLight.position = scene_SpotLightPosition[i];
                    spotLight.direction = scene_SpotLightDirection[i];
                    spotLight.distance = scene_SpotLightDistance[i];
                    spotLight.angleCos = scene_SpotLightAngleCos[i];
                    spotLight.penumbraCos = scene_SpotLightPenumbraCos[i];
                #endif
                addSpotDirectLightRadiance( varyings, surfaceData, brdfData, spotLight, color );
            } 
        }

    #endif
}


#endif