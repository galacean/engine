    #ifdef NORMALTEXTURE
        mat3 tbn = getTBN();
        vec3 N = getNormalByNormalTexture(tbn, u_normalTexture, u_normalIntensity, v_uv);
    #else
        vec3 N = getNormal();
    #endif

    vec3 lightDiffuse = vec3( 0.0, 0.0, 0.0 );
    vec3 lightSpecular = vec3( 0.0, 0.0, 0.0 );
    float shadowAttenuation = 1.0;

    #ifdef O3_DIRECT_LIGHT_COUNT
    shadowAttenuation = 1.0;
    #ifdef OASIS_CALCULATE_SHADOWS
        shadowAttenuation *= sampleShadowMap();
        int sunIndex = int(u_shadowInfo.z);
    #endif

    DirectLight directionalLight;
    for( int i = 0; i < O3_DIRECT_LIGHT_COUNT; i++ ) {
        directionalLight.color = u_directLightColor[i];
    #ifdef OASIS_CALCULATE_SHADOWS
        if (i == sunIndex) {
            directionalLight.color *= shadowAttenuation;
        }
    #endif
        directionalLight.direction = u_directLightDirection[i];

        float d = max(dot(N, -directionalLight.direction), 0.0);
        lightDiffuse += directionalLight.color * d;

        vec3 halfDir = normalize( V - directionalLight.direction );
        float s = pow( clamp( dot( N, halfDir ), 0.0, 1.0 ), u_shininess );
        lightSpecular += directionalLight.color * s;
    }

    #endif

    #ifdef O3_POINT_LIGHT_COUNT
    
    PointLight pointLight;

    for( int i = 0; i < O3_POINT_LIGHT_COUNT; i++ ) {
        pointLight.color = u_pointLightColor[i];
        pointLight.position = u_pointLightPosition[i];
        pointLight.distance = u_pointLightDistance[i];

        vec3 direction = v_pos - pointLight.position;
        float dist = length( direction );
        direction /= dist;
        float decay = clamp(1.0 - pow(dist / pointLight.distance, 4.0), 0.0, 1.0);

        float d =  max( dot( N, -direction ), 0.0 ) * decay;
        lightDiffuse += pointLight.color * d;

        vec3 halfDir = normalize( V - direction );
        float s = pow( clamp( dot( N, halfDir ), 0.0, 1.0 ), u_shininess )  * decay;
        lightSpecular += pointLight.color * s;

    }

    #endif

    #ifdef O3_SPOT_LIGHT_COUNT
   
    SpotLight spotLight;

    for( int i = 0; i < O3_SPOT_LIGHT_COUNT; i++) {
        spotLight.color = u_spotLightColor[i];
        spotLight.position = u_spotLightPosition[i];
        spotLight.direction = u_spotLightDirection[i];
        spotLight.distance = u_spotLightDistance[i];
        spotLight.angleCos = u_spotLightAngleCos[i];
        spotLight.penumbraCos = u_spotLightPenumbraCos[i];

        vec3 direction = spotLight.position - v_pos;
        float lightDistance = length( direction );
        direction /= lightDistance;
        float angleCos = dot( direction, -spotLight.direction );
        float decay = clamp(1.0 - pow(lightDistance/spotLight.distance, 4.0), 0.0, 1.0);
        float spotEffect = smoothstep( spotLight.penumbraCos, spotLight.angleCos, angleCos );
        float decayTotal = decay * spotEffect;
        float d = max( dot( N, direction ), 0.0 )  * decayTotal;
        lightDiffuse += spotLight.color * d;

        vec3 halfDir = normalize( V + direction );
        float s = pow( clamp( dot( N, halfDir ), 0.0, 1.0 ), u_shininess ) * decayTotal;
        lightSpecular += spotLight.color * s;

    }

    #endif

    diffuse *= vec4( lightDiffuse, 1.0 );
    specular *= vec4( lightSpecular, 1.0 );

    #ifdef ALPHA_CUTOFF
        if( diffuse.a < u_alphaCutoff ) {
            discard;
        }
    #endif
