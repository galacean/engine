    #ifdef O3_HAS_UV

    v_uv = TEXCOORD_0;

    #else

    // may need this calculate normal
    v_uv = vec2( 0., 0. );

    #endif
