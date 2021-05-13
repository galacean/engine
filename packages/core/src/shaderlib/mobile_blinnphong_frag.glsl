    vec3 N = getNormal();
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

        vec3 direction = v_pos - lgt.position;
        float dist = length( direction );
        direction /= dist;
        float decay = clamp(1.0 - pow(dist/lgt.distance, 4.0), 0.0, 1.0);

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
        lgt.angleCos = u_spotLightAngleCos[i];
        lgt.penumbraCos = u_spotLightPenumbraCos[i];

        vec3 direction = lgt.position - v_pos;
        float lightDistance = length( direction );
        direction/ = lightDistance;
        float angleCos = dot( direction, -lgt.direction );
        float decay = clamp(1.0 - pow(lightDistance/lgt.distance, 4.0), 0.0, 1.0);
        float spotEffect = smoothstep( lgt.penumbraCos, lgt.angleCos, angleCos );
        float decayTotal = decay * spotEffect;
        float d = max( dot( N, direction ), 0.0 )  * decayTotal;
        lightDiffuse += lgt.color * d;

        vec3 halfDir = normalize( V + direction );
        float s = pow( clamp( dot( N, halfDir ), 0.0, 1.0 ), u_shininess ) * decayTotal;
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
