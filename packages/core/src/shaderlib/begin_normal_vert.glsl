#ifndef OMIT_NORMAL
    #ifdef O3_HAS_NORMAL
        vec3 normal = vec3( NORMAL );
    #endif

    #ifdef O3_HAS_TANGENT
        vec4 tangent = vec4( TANGENT );
    #endif
#endif