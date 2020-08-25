    #if defined( O3_NEED_WORLDPOS ) || defined( O3_HAS_ENVMAP ) || defined( O3_HAS_LIGHTMAP ) || defined(O3_CLIPPLANE_NUM)

    vec4 temp_pos = u_modelMat * position;
    v_pos = temp_pos.xyz / temp_pos.w;

    #endif
