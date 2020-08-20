    #ifdef O3_HAS_NORMAL
         N *= float( gl_FrontFacing ) * 2.0 - 1.0;
    #else
         vec3 N = vec3(0, 0, 1);
    #endif


    vec3 lightDiffuse = vec3( 0.0, 0.0, 0.0 );
    vec3 lightSpecular = vec3( 0.0, 0.0, 0.0 );

    #ifdef O3_DIRECT_LIGHT_COUNT

    for( int i = 0; i < O3_DIRECT_LIGHT_COUNT; i++ ) {
        DirectLight lgt = u_directLights[ i ];

        float d = max(dot(N, -lgt.direction), 0.0)*lgt.intensity;
        lightDiffuse += lgt.color*d;

        vec3 halfDir = normalize( V - lgt.direction );
        float s = pow( clamp( dot( N, halfDir ), 0.0, 1.0 ), u_shininess ) * lgt.intensity;
        lightSpecular += lgt.color * s;
    }

    #endif

    #ifdef O3_POINT_LIGHT_COUNT

    for( int i = 0; i < O3_POINT_LIGHT_COUNT; i++ ) {
        PointLight lgt = u_pointLights[ i ];
        vec3 direction = v_pos - lgt.position;
        float dist = length( direction );
        direction /= dist;
        float decay = pow( max( 0.0, 1.0-dist/lgt.distance ), 2.0 );

        float d =  max( dot( N, -direction ), 0.0 )*lgt.intensity*decay;
        lightDiffuse += lgt.color*d;

        vec3 halfDir = normalize( V - direction );
        float s = pow( clamp( dot( N, halfDir ), 0.0, 1.0 ), u_shininess ) * lgt.intensity * decay;
        lightSpecular += lgt.color * s;

    }

    #endif

    #ifdef O3_SPOT_LIGHT_COUNT

    for( int i = 0; i < O3_SPOT_LIGHT_COUNT; i++) {
        SpotLight lgt = u_spotLights[ i ];
        vec3 direction = v_pos - lgt.position;
        float angle = acos( dot( normalize( direction ), normalize( lgt.direction ) ) );
        float dist = length( direction );
        direction /= dist;
        float decay = pow( max( 0.0, 1.0 - dist / lgt.distance ), 2.0 );

        float hasLight = step( angle, lgt.angle );
        float hasPenumbra = step( lgt.angle, angle ) * step( angle, lgt.angle * ( 1.0 + lgt.penumbra ) );
        float penumbra = hasPenumbra * ( 1.0 - ( angle - lgt.angle ) / ( lgt.angle * lgt.penumbra ) );
        float d = max( dot( N, -direction ), 0.0 ) * lgt.intensity * decay * ( penumbra + hasLight );
        lightDiffuse += lgt.color * d;

        vec3 halfDir = normalize( V - direction );
        float s = pow( clamp( dot( N, halfDir ), 0.0, 1.0 ), u_shininess ) * lgt.intensity * decay * ( penumbra + hasLight );
        lightSpecular += lgt.color * s;

    }

    #endif

    diffuse *= vec4( lightDiffuse, 1.0 );
    specular *= vec4( lightSpecular, 1.0 );
