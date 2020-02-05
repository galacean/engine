    #ifdef O3_HAS_UV

    v_uv = a_uv;

    #elif defined( O3_NEED_UV ) || defined( O3_HAS_ENVMAP ) || defined( O3_HAS_LIGHTMAP )

    // may need this calculate normal
    v_uv = vec2( 0., 0. );

    #endif
