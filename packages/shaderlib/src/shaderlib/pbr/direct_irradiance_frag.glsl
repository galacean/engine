        #if defined( O3_DIRECT_LIGHT_COUNT ) && defined( RE_Direct )

            DirectLight directionalLight;

            for ( int i = 0; i < O3_DIRECT_LIGHT_COUNT; i ++ ) {

                directionalLight = u_directLights[ i ];

                getDirectionalDirectLightIrradiance( directionalLight, geometry, directLight );

                RE_Direct( directLight, geometry, material, reflectedLight );

            }

        #endif

        #if defined( O3_POINT_LIGHT_COUNT ) && defined( RE_Direct )

            PointLight pointLight;

            for ( int i = 0; i < O3_POINT_LIGHT_COUNT; i ++ ) {

                pointLight = u_pointLights[ i ];

                getPointDirectLightIrradiance( pointLight, geometry, directLight );

                RE_Direct( directLight, geometry, material, reflectedLight );

            }

        #endif

        #if defined( O3_SPOT_LIGHT_COUNT ) && defined( RE_Direct )

            SpotLight spotLight;

            for ( int i = 0; i < O3_SPOT_LIGHT_COUNT; i ++ ) {

                spotLight = u_spotLights[ i ];

                getSpotDirectLightIrradiance( spotLight, geometry, directLight );

                RE_Direct( directLight, geometry, material, reflectedLight );

            }

        #endif
