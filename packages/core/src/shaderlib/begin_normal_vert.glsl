#ifndef MATERIAL_OMIT_NORMAL
    #ifdef RENDERER_HAS_NORMAL
        vec3 normal = vec3( NORMAL );
    #endif

    #ifdef RENDERER_HAS_TANGENT
        vec4 tangent = vec4( TANGENT );
    #endif
#endif