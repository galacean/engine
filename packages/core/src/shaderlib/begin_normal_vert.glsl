#ifndef OMIT_NORMAL
    #ifdef GALACEAN_HAS_NORMAL
        vec3 normal = vec3( NORMAL );
    #endif

    #ifdef GALACEAN_HAS_TANGENT
        vec4 tangent = vec4( TANGENT );
    #endif
#endif