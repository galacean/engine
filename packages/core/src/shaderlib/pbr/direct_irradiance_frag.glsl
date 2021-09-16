        #ifdef O3_DIRECT_LIGHT_COUNT

            DirectLight directionalLight;

            for ( int i = 0; i < O3_DIRECT_LIGHT_COUNT; i ++ ) {

                directionalLight.color = u_directLightColor[i];
                directionalLight.direction = u_directLightDirection[i];
                
                getDirectionalDirectLightIrradiance( directionalLight, geometry, directLight );

                RE_Direct_Physical( directLight, geometry, material, reflectedLight );

            }

        #endif

        #ifdef O3_POINT_LIGHT_COUNT

            PointLight pointLight;

            for ( int i = 0; i < O3_POINT_LIGHT_COUNT; i ++ ) {

                pointLight.color = u_pointLightColor[i];
                pointLight.position = u_pointLightPosition[i];
                pointLight.distance = u_pointLightDistance[i];

                getPointDirectLightIrradiance( pointLight, geometry, directLight );

                RE_Direct_Physical( directLight, geometry, material, reflectedLight );

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

                getSpotDirectLightIrradiance( spotLight, geometry, directLight );

                RE_Direct_Physical( directLight, geometry, material, reflectedLight );

            }

        #endif
