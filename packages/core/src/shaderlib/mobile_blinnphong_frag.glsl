    #ifdef MATERIAL_HAS_NORMALTEXTURE
        mat3 tbn = getTBN(gl_FrontFacing);
        vec3 N = getNormalByNormalTexture(tbn, material_NormalTexture, material_NormalIntensity, v_uv, gl_FrontFacing);
    #else
        vec3 N = getNormal(gl_FrontFacing);
    #endif

    vec3 lightDiffuse = vec3( 0.0, 0.0, 0.0 );
    vec3 lightSpecular = vec3( 0.0, 0.0, 0.0 );
    float shadowAttenuation = 1.0;

    #ifdef SCENE_DIRECT_LIGHT_COUNT
        shadowAttenuation = 1.0;
        #ifdef SCENE_IS_CALCULATE_SHADOWS
            shadowAttenuation *= sampleShadowMap();
            // int sunIndex = int(scene_ShadowInfo.z);
        #endif

    DirectLight directionalLight;
    for( int i = 0; i < SCENE_DIRECT_LIGHT_COUNT; i++ ) {
        if(!isRendererCulledByLight(renderer_Layer.xy, scene_DirectLightCullingMask[i])){
            directionalLight.color = scene_DirectLightColor[i];
            #ifdef SCENE_IS_CALCULATE_SHADOWS
                if (i == 0) { // Sun light index is always 0
                    directionalLight.color *= shadowAttenuation;
                }
            #endif
            directionalLight.direction = scene_DirectLightDirection[i];
    
            float d = max(dot(N, -directionalLight.direction), 0.0);
            lightDiffuse += directionalLight.color * d;
    
            vec3 halfDir = normalize( V - directionalLight.direction );
            float s = pow( clamp( dot( N, halfDir ), 0.0, 1.0 ), material_Shininess );
            lightSpecular += directionalLight.color * s;
        }
    }

    #endif

    #ifdef SCENE_POINT_LIGHT_COUNT
    PointLight pointLight;
    for( int i = 0; i < SCENE_POINT_LIGHT_COUNT; i++ ) {
        if(!isRendererCulledByLight(renderer_Layer.xy, scene_PointLightCullingMask[i])){
            pointLight.color = scene_PointLightColor[i];
            pointLight.position = scene_PointLightPosition[i];
            pointLight.distance = scene_PointLightDistance[i];

            vec3 direction = v_pos - pointLight.position;
            float dist = length( direction );
            direction /= dist;
            float decay = clamp(1.0 - pow(dist / pointLight.distance, 4.0), 0.0, 1.0);

            float d =  max( dot( N, -direction ), 0.0 ) * decay;
            lightDiffuse += pointLight.color * d;

            vec3 halfDir = normalize( V - direction );
            float s = pow( clamp( dot( N, halfDir ), 0.0, 1.0 ), material_Shininess )  * decay;
            lightSpecular += pointLight.color * s;
        }
    }

    #endif

    #ifdef SCENE_SPOT_LIGHT_COUNT
    SpotLight spotLight;
    for( int i = 0; i < SCENE_SPOT_LIGHT_COUNT; i++) {
        if(!isRendererCulledByLight(renderer_Layer.xy, scene_SpotLightCullingMask[i])){
            spotLight.color = scene_SpotLightColor[i];
            spotLight.position = scene_SpotLightPosition[i];
            spotLight.direction = scene_SpotLightDirection[i];
            spotLight.distance = scene_SpotLightDistance[i];
            spotLight.angleCos = scene_SpotLightAngleCos[i];
            spotLight.penumbraCos = scene_SpotLightPenumbraCos[i];

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
            float s = pow( clamp( dot( N, halfDir ), 0.0, 1.0 ), material_Shininess ) * decayTotal;
            lightSpecular += spotLight.color * s;
        }
    }

    #endif

    diffuse *= vec4( lightDiffuse, 1.0 );
    specular *= vec4( lightSpecular, 1.0 );

    #ifdef MATERIAL_IS_ALPHA_CUTOFF
        if( diffuse.a < material_AlphaCutoff ) {
            discard;
        }
    #endif
