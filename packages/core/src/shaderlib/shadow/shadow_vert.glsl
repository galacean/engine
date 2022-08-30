#ifdef CASCADED_SHADOW_MAP_COUNT
    vec4 view_pos4 = u_viewMat * u_modelMat * position;
    view_pos = view_pos4.xyz / view_pos4.w;
#endif
