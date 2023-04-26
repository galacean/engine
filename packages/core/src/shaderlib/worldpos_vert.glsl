#ifdef MATERIAL_NEED_WORLD_POS
    vec4 temp_pos = renderer_ModelMat * position;
    v_pos = temp_pos.xyz / temp_pos.w;
#endif
