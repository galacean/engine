#ifdef O3_NEED_WORLDPOS
    vec4 temp_pos = galacean_ModelMat * position;
    v_pos = temp_pos.xyz / temp_pos.w;
#endif
