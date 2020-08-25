    #ifdef O3_GENERATE_SHADOW_MAP

    gl_Position = u_projMatFromLight * u_viewMatFromLight * u_modelMat * position;

    #endif

    #ifdef O3_SHADOW_MAP_COUNT

    for (int i = 0; i < O3_SHADOW_MAP_COUNT; i++) {

        v_PositionFromLight[i] = u_projMatFromLight[i] * u_viewMatFromLight[i] * u_modelMat * vec4( a_position, 1.0 );

    }

    #endif
