    #ifdef O3_HAS_NORMAL

        #if defined( O3_HAS_TANGENT ) && defined( O3_NORMAL_TEXTURE )

        vec3 N = normalize( v_TBN[ 2 ] );

        #else

        vec3 N = normalize( v_normal );

        #endif

    #endif
