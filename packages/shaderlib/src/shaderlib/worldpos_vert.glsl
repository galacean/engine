    #if defined( R3_NEED_WORLDPOS ) || defined( R3_HAS_ENVMAP ) || defined( R3_HAS_LIGHTMAP )

    vec4 temp_pos = u_modelMat * position;
    v_pos = temp_pos.xyz / temp_pos.w;

    #endif
