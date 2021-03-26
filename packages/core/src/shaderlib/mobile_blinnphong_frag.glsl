    #ifdef O3_HAS_NORMAL
         N *= float( gl_FrontFacing ) * 2.0 - 1.0;
    #else
         vec3 N = vec3(0, 0, 1);
    #endif


    vec3 lightDiffuse = vec3( 0.0, 0.0, 0.0 );
    vec3 lightSpecular = vec3( 0.0, 0.0, 0.0 );

    #ifdef O3_DIRECT_LIGHT_COUNT
    
    DirectLight lgt;

    for( int i = 0; i < O3_DIRECT_LIGHT_COUNT; i++ ) {
        lgt.color = u_directLightColor[i];
        lgt.direction = u_directLightDirection[i];

        float d = max(dot(N, -lgt.direction), 0.0);
        lightDiffuse += lgt.color*d;

        vec3 halfDir = normalize( V - lgt.direction );
        float s = pow( clamp( dot( N, halfDir ), 0.0, 1.0 ), u_shininess );
        lightSpecular += lgt.color * s;
    }

    #endif

    #ifdef O3_POINT_LIGHT_COUNT
    
    PointLight lgt;

    for( int i = 0; i < O3_POINT_LIGHT_COUNT; i++ ) {
        lgt.color = u_pointLightColor[i];
        lgt.position = u_pointLightPosition[i];
        lgt.distance = u_pointLightDistance[i];
        lgt.decay = u_pointLightDecay[i];

        vec3 direction = v_pos - lgt.position;
        float dist = length( direction );
        direction /= dist;
        float decay = pow( max( 0.0, 1.0-dist / lgt.distance ), 2.0 );

        float d =  max( dot( N, -direction ), 0.0 ) * decay;
        lightDiffuse += lgt.color * d;

        vec3 halfDir = normalize( V - direction );
        float s = pow( clamp( dot( N, halfDir ), 0.0, 1.0 ), u_shininess )  * decay;
        lightSpecular += lgt.color * s;

    }

    #endif

    #ifdef O3_SPOT_LIGHT_COUNT
   
    SpotLight lgt;

    for( int i = 0; i < O3_SPOT_LIGHT_COUNT; i++) {
        lgt.color = u_spotLightColor[i];
        lgt.position = u_spotLightPosition[i];
        lgt.direction = u_spotLightDirection[i];
        lgt.distance = u_spotLightDistance[i];
        lgt.decay = u_spotLightDecay[i];
        lgt.angle = u_spotLightAngle[i];
        lgt.penumbra = u_spotLightPenumbra[i];

        vec3 direction = v_pos - lgt.position;
        float angle = acos( dot( normalize( direction ), normalize( lgt.direction ) ) );
        float dist = length( direction );
        direction /= dist;
        float decay = pow( max( 0.0, 1.0 - dist / lgt.distance ), 2.0 );

        float hasLight = step( angle, lgt.angle );
        float hasPenumbra = step( lgt.angle, angle ) * step( angle, lgt.angle * ( 1.0 + lgt.penumbra ) );
        float penumbra = hasPenumbra * ( 1.0 - ( angle - lgt.angle ) / ( lgt.angle * lgt.penumbra ) );
        float d = max( dot( N, -direction ), 0.0 )  * decay * ( penumbra + hasLight );
        lightDiffuse += lgt.color * d;

        vec3 halfDir = normalize( V - direction );
        float s = pow( clamp( dot( N, halfDir ), 0.0, 1.0 ), u_shininess ) * decay * ( penumbra + hasLight );
        lightSpecular += lgt.color * s;

    }

    #endif

    diffuse *= vec4( lightDiffuse, 1.0 );
    specular *= vec4( lightSpecular, 1.0 );

    #ifdef ALPHA_CUTOFF
        if( diffuse.a < u_alphaCutoff ) {
            discard;
        }
    #endif
