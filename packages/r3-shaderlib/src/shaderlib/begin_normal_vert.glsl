    #ifdef R3_HAS_NORMAL

    vec3 normal = vec3( a_normal );

        #if defined( R3_HAS_TANGENT ) && defined( R3_HAS_NORMALMAP )

        vec4 tangent = vec4( a_tangent );

        #endif

    #endif
