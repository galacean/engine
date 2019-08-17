    vec3 totalLight = vec3(0.0, 0.0, 0.0);
    #ifdef O3_DIRECT_LIGHT_COUNT
    for( int i = 0; i < O3_DIRECT_LIGHT_COUNT; i++ ){
        vec3 lightColor = u_directLights[ i ].color * u_directLights[ i ].intensity;
        lightColor *= max( dot( N, -u_directLights[ i ].direction ), 0.0 );

        totalLight += lightColor;
    }
    #endif
    diffuse *= vec4( totalLight, 1.0 );
