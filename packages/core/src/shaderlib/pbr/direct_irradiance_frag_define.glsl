void addDirectRadiance(vec3 incidentDirection, vec3 color, GeometricContext geometry, PhysicalMaterial material, inout ReflectedLight reflectedLight) {
    float dotNL = saturate( dot( geometry.normal, incidentDirection ) );

    vec3 irradiance = dotNL * color;
    irradiance *= PI;
    
    reflectedLight.directSpecular += irradiance * BRDF_Specular_GGX( incidentDirection, geometry, material.specularColor, material.roughness);

    reflectedLight.directDiffuse += irradiance * BRDF_Diffuse_Lambert( material.diffuseColor );

}

#ifdef O3_DIRECT_LIGHT_COUNT

    void addDirectionalDirectLightRadiance(DirectLight directionalLight, GeometricContext geometry, PhysicalMaterial material, inout ReflectedLight reflectedLight) {
        vec3 color = directionalLight.color;
        vec3 direction = -directionalLight.direction;

		addDirectRadiance( direction, color, geometry, material, reflectedLight );

    }

#endif

#ifdef O3_POINT_LIGHT_COUNT

	void addPointDirectLightRadiance(PointLight pointLight, GeometricContext geometry, PhysicalMaterial material, inout ReflectedLight reflectedLight) {

		vec3 lVector = pointLight.position - geometry.position;
		vec3 direction = normalize( lVector );

		float lightDistance = length( lVector );

		vec3 color = pointLight.color;
		color *= clamp(1.0 - pow(lightDistance/pointLight.distance, 4.0), 0.0, 1.0);
        
		addDirectRadiance( direction, color, geometry, material, reflectedLight );

	}

#endif

#ifdef O3_SPOT_LIGHT_COUNT

	void addSpotDirectLightRadiance(SpotLight spotLight, GeometricContext geometry, PhysicalMaterial material, inout ReflectedLight reflectedLight) {

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

void addTotalDirectRadiance(GeometricContext geometry, PhysicalMaterial material, inout ReflectedLight reflectedLight){
	    #ifdef O3_DIRECT_LIGHT_COUNT

            DirectLight directionalLight;

            for ( int i = 0; i < O3_DIRECT_LIGHT_COUNT; i ++ ) {

                directionalLight.color = u_directLightColor[i];
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