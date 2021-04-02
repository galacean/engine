#ifdef O3_HAS_NORMAL

    #if defined( O3_HAS_TANGENT ) && defined( O3_NORMAL_TEXTURE )

    varying mat3 v_TBN;

    #else

    varying vec3 v_normal;

    #endif

#endif
