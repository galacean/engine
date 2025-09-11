#ifdef SCENE_ENABLE_AMBIENT_OCCLUSION
    v_ViewportCoord = (gl_Position.xy / gl_Position.w) * 0.5 + 0.5;
#endif
