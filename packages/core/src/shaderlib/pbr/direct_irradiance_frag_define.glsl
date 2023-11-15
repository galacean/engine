#include <ShadowFragmentDeclaration>

void addDirectRadiance(vec3 incidentDirection, vec3 color, Geometry geometry, Material material, inout ReflectedLight reflectedLight) {
    float attenuation = 1.0;

    #ifdef MATERIAL_ENABLE_CLEAR_COAT
        float clearCoatDotNL = saturate( dot( geometry.clearCoatNormal, incidentDirection ) );
        vec3 clearCoatIrradiance = clearCoatDotNL * color;
        
        reflectedLight.directSpecular += material.clearCoat * clearCoatIrradiance * BRDF_Specular_GGX( incidentDirection, geometry.viewDir, geometry.clearCoatNormal, vec3( 0.04 ), material.clearCoatRoughness );
        attenuation -= material.clearCoat * F_Schlick(geometry.clearCoatDotNV);
    #endif

    float dotNL = saturate( dot( geometry.normal, incidentDirection ) );
    vec3 irradiance = dotNL * color * PI;

    reflectedLight.directSpecular += attenuation * irradiance * BRDF_Specular_GGX( incidentDirection, geometry.viewDir, geometry.normal, material.specularColor, material.roughness);
    reflectedLight.directDiffuse += attenuation * irradiance * BRDF_Diffuse_Lambert( material.diffuseColor );

}

#ifdef SCENE_DIRECT_LIGHT_COUNT

    void addDirectionalDirectLightRadiance(DirectLight directionalLight, Geometry geometry, Material material, inout ReflectedLight reflectedLight) {
        vec3 color = directionalLight.color;
        vec3 direction = -directionalLight.direction;

		addDirectRadiance( direction, color, geometry, material, reflectedLight );

    }

#endif

#ifdef SCENE_POINT_LIGHT_COUNT

	void addPointDirectLightRadiance(PointLight pointLight, Geometry geometry, Material material, inout ReflectedLight reflectedLight) {

		vec3 lVector = pointLight.position - geometry.position;
		vec3 direction = normalize( lVector );

		float lightDistance = length( lVector );

		vec3 color = pointLight.color;
		color *= clamp(1.0 - pow(lightDistance/pointLight.distance, 4.0), 0.0, 1.0);
        
		addDirectRadiance( direction, color, geometry, material, reflectedLight );

	}

#endif

#ifdef SCENE_SPOT_LIGHT_COUNT

	void addSpotDirectLightRadiance(SpotLight spotLight, Geometry geometry, Material material, inout ReflectedLight reflectedLight) {

		vec3 lVector = spotLight.position - geometry.position;
		vec3 direction = normalize( lVector );

		float lightDistance = length( lVector );
		float angleCos = dot( direction, -spotLight.direction );

		float spotEffect = smoothstep( spotLight.penumbraCos, spotLight.angleCos, angleCos );
		float decayEffect = clamp(1.0 - pow(lightDistance/spotLight.distance, 4.0), 0.0, 1.0);

		vec3 color = spotLight.color;
		color *= spotEffect * decayEffect;
		
		addDirectRadiance( direction, color, geometry, material, reflectedLight );
		
	}


#endif

void addTotalDirectRadiance(Geometry geometry, Material material, inout ReflectedLight reflectedLight){
    float shadowAttenuation = 1.0;

    #ifdef SCENE_DIRECT_LIGHT_COUNT
        shadowAttenuation = 1.0;
        #ifdef SCENE_IS_CALCULATE_SHADOWS
            shadowAttenuation *= sampleShadowMap();
            // int sunIndex = int(scene_ShadowInfo.z);
        #endif

        DirectLight directionalLight;
        for ( int i = 0; i < SCENE_DIRECT_LIGHT_COUNT; i ++ ) {
            // warning: use `continue` syntax may trigger flickering bug in safri 16.1.
            if(!isRendererCulledByLight(renderer_Layer.xy, scene_DirectLightCullingMask[i])){
                directionalLight.color = scene_DirectLightColor[i];
                #ifdef SCENE_IS_CALCULATE_SHADOWS
                    if (i == 0) { // Sun light index is always 0
                        directionalLight.color *= shadowAttenuation;
                    }
                #endif
                directionalLight.direction = scene_DirectLightDirection[i];
                addDirectionalDirectLightRadiance( directionalLight, geometry, material, reflectedLight );
            }
        }

    #endif

    #ifdef SCENE_POINT_LIGHT_COUNT

        PointLight pointLight;

        for ( int i = 0; i < SCENE_POINT_LIGHT_COUNT; i ++ ) {
            if(!isRendererCulledByLight(renderer_Layer.xy, scene_PointLightCullingMask[i])){
                pointLight.color = scene_PointLightColor[i];
                pointLight.position = scene_PointLightPosition[i];
                pointLight.distance = scene_PointLightDistance[i];

                addPointDirectLightRadiance( pointLight, geometry, material, reflectedLight );
            } 
        }

    #endif

    #ifdef SCENE_SPOT_LIGHT_COUNT

        SpotLight spotLight;

        for ( int i = 0; i < SCENE_SPOT_LIGHT_COUNT; i ++ ) {
            if(!isRendererCulledByLight(renderer_Layer.xy, scene_SpotLightCullingMask[i])){
                spotLight.color = scene_SpotLightColor[i];
                spotLight.position = scene_SpotLightPosition[i];
                spotLight.direction = scene_SpotLightDirection[i];
                spotLight.distance = scene_SpotLightDistance[i];
                spotLight.angleCos = scene_SpotLightAngleCos[i];
                spotLight.penumbraCos = scene_SpotLightPenumbraCos[i];

                addSpotDirectLightRadiance( spotLight, geometry, material, reflectedLight );
            } 
        }

    #endif
}