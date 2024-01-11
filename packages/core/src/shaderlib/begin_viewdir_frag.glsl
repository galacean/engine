#ifdef CAMERA_ORTHOGRAPHIC
    vec3 V = -camera_Forward;
#elif defined(MATERIAL_NEED_WORLD_POS)
    vec3 V =  normalize( camera_Position - v_pos );
#endif
