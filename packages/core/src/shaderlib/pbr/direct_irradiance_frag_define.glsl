void RE_Direct_Physical( const in IncidentLight directLight, const in GeometricContext geometry, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {

    float dotNL = saturate( dot( geometry.normal, directLight.direction ) );

    vec3 irradiance = dotNL * directLight.color;

    #ifndef PHYSICALLY_CORRECT_LIGHTS

        irradiance *= PI; // punctual light

    #endif


		float alpha = pow2( material.specularRoughness ); // UE4's roughness

		vec3 halfDir = normalize( directLight.direction + geometry.viewDir );

		// float dotNL = saturate( dot( geometry.normal, directLight.direction ) );
		float dotNV = saturate( dot( geometry.normal, geometry.viewDir ) );
		float dotNH = saturate( dot( geometry.normal, halfDir ) );
		float dotLH = saturate( dot( directLight.direction, halfDir ) );

		vec3 F = F_Schlick( material.specularColor, dotLH );

		float G = G_GGX_SmithCorrelated( alpha, dotNL, dotNV );

		float D = D_GGX( alpha, dotNH );

    reflectedLight.directSpecular += F * irradiance * F * G * D;

    reflectedLight.directDiffuse += (vec3(1.0) - F) * irradiance * RECIPROCAL_PI * material.diffuseColor;

}



#ifdef O3_DIRECT_LIGHT_COUNT

    void getDirectionalDirectLightIrradiance( const in DirectLight directionalLight, const in GeometricContext geometry, out IncidentLight directLight ) {
        directLight.color = directionalLight.color;
        directLight.direction = -directionalLight.direction;
        directLight.visible = true;
    }

#endif

#ifdef O3_POINT_LIGHT_COUNT

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

#ifdef O3_SPOT_LIGHT_COUNT

	// directLight is an out parameter as having it as a return value caused compiler errors on some devices
	void getSpotDirectLightIrradiance( const in SpotLight spotLight, const in GeometricContext geometry, out IncidentLight directLight  ) {

		vec3 lVector = spotLight.position - geometry.position;
		directLight.direction = normalize( lVector );

		float lightDistance = length( lVector );
		float angleCos = dot( directLight.direction, -spotLight.direction );

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
