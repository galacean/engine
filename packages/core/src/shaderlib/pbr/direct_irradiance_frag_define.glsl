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
#ifdef OASIS_CALCULATE_SHADOWS
        shadowAttenuation *= sampleShadowMap();
        int sunIndex = int(u_shadowInfo.z);
#endif

            DirectLight directionalLight;
            for ( int i = 0; i < O3_DIRECT_LIGHT_COUNT; i ++ ) {
                directionalLight.color = u_directLightColor[i];
#ifdef OASIS_CALCULATE_SHADOWS
                if (i == sunIndex) {
                    directionalLight.color *= shadowAttenuation;
                }
#endif
                directionalLight.direction = u_directLightDirection[i];
                addDirectionalDirectLightRadiance( directionalLight, geometry, material, reflectedLight );
            }

        #endif

        #ifdef O3_POINT_LIGHT_COUNT

            PointLight pointLight;

            for ( int i = 0; i < O3_POINT_LIGHT_COUNT; i ++ ) {

                pointLight.color = u_pointLightColor[i];
                pointLight.position = u_pointLightPosition[i];
                pointLight.distance = u_pointLightDistance[i];

                addPointDirectLightRadiance( pointLight, geometry, material, reflectedLight );
            }

        #endif

        #ifdef O3_SPOT_LIGHT_COUNT

            SpotLight spotLight;

            for ( int i = 0; i < O3_SPOT_LIGHT_COUNT; i ++ ) {

                spotLight.color = u_spotLightColor[i];
                spotLight.position = u_spotLightPosition[i];
                spotLight.direction = u_spotLightDirection[i];
                spotLight.distance = u_spotLightDistance[i];
                spotLight.angleCos = u_spotLightAngleCos[i];
                spotLight.penumbraCos = u_spotLightPenumbraCos[i];

                addSpotDirectLightRadiance( spotLight, geometry, material, reflectedLight );
            }

        #endif

}