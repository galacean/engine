    #ifdef R3_HAS_UV

    v_uv = a_uv;

    #elif defined( R3_NEED_UV ) || defined( R3_HAS_ENVMAP ) || defined( R3_HAS_LIGHTMAP )

    // may need this calculate normal
    v_uv = vec2( 0., 0. );

    #endif
