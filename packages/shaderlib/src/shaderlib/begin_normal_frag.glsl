    #ifdef R3_HAS_NORMAL

        #if defined( R3_HAS_TANGENT ) && defined( R3_HAS_NORMALMAP )

        vec3 N = normalize( v_TBN[ 2 ] );

        #else

        vec3 N = normalize( v_normal );

        #endif

    #endif
