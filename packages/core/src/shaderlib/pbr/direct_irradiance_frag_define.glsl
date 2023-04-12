#include <ShadowFragmentDeclaration>

void addDirectRadiance(vec3 incidentDirection, vec3 color, Geometry geometry, Material material, inout ReflectedLight reflectedLight) {
    float attenuation = 1.0;

    #ifdef CLEARCOAT
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

#ifdef O3_DIRECT_LIGHT_COUNT

    void addDirectionalDirectLightRadiance(DirectLight directionalLight, Geometry geometry, Material material, inout ReflectedLight reflectedLight) {
        vec3 color = directionalLight.color;
        vec3 direction = -directionalLight.direction;

		addDirectRadiance( direction, color, geometry, material, reflectedLight );

    }

#endif

#ifdef O3_POINT_LIGHT_COUNT

	void addPointDirectLightRadiance(PointLight pointLight, Geometry geometry, Material material, inout ReflectedLight reflectedLight) {

		vec3 lVector = pointLight.position - geometry.position;
		vec3 direction = normalize( lVector );

		float lightDistance = length( lVector );

		vec3 color = pointLight.color;
		color *= clamp(1.0 - pow(lightDistance/pointLight.distance, 4.0), 0.0, 1.0);
        
		addDirectRadiance( direction, color, geometry, material, reflectedLight );

	}

#endif

#ifdef O3_SPOT_LIGHT_COUNT

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

    #ifdef O3_DIRECT_LIGHT_COUNT
        shadowAttenuation = 1.0;
    #ifdef GALACEAN_CALCULATE_SHADOWS
        shadowAttenuation *= sampleShadowMap();
        int sunIndex = int(galacean_ShadowInfo.z);
    #endif

        DirectLight directionalLight;
        for ( int i = 0; i < O3_DIRECT_LIGHT_COUNT; i ++ ) {
            if(isRendererCulledByLight(galacean_RendererLayer.xy, galacean_DirectLightCullingMask[i])) 
                continue;

            directionalLight.color = galacean_DirectLightColor[i];
            #ifdef GALACEAN_CALCULATE_SHADOWS
                if (i == sunIndex) {
                    directionalLight.color *= shadowAttenuation;
                }
            #endif
            directionalLight.direction = galacean_DirectLightDirection[i];
            addDirectionalDirectLightRadiance( directionalLight, geometry, material, reflectedLight );
        }

    #endif

    #ifdef O3_POINT_LIGHT_COUNT

        PointLight pointLight;

        for ( int i = 0; i < O3_POINT_LIGHT_COUNT; i ++ ) {
            if(isRendererCulledByLight(galacean_RendererLayer.xy, galacean_PointLightCullingMask[i])) 
                continue;

            pointLight.color = galacean_PointLightColor[i];
            pointLight.position = galacean_PointLightPosition[i];
            pointLight.distance = galacean_PointLightDistance[i];

            addPointDirectLightRadiance( pointLight, geometry, material, reflectedLight );
        }

    #endif

    #ifdef O3_SPOT_LIGHT_COUNT

        SpotLight spotLight;

        for ( int i = 0; i < O3_SPOT_LIGHT_COUNT; i ++ ) {
            if(isRendererCulledByLight(galacean_RendererLayer.xy, galacean_SpotLightCullingMask[i])) 
                continue;

            spotLight.color = galacean_SpotLightColor[i];
            spotLight.position = galacean_SpotLightPosition[i];
            spotLight.direction = galacean_SpotLightDirection[i];
            spotLight.distance = galacean_SpotLightDistance[i];
            spotLight.angleCos = galacean_SpotLightAngleCos[i];
            spotLight.penumbraCos = galacean_SpotLightPenumbraCos[i];

            addSpotDirectLightRadiance( spotLight, geometry, material, reflectedLight );
        }

    #endif
}