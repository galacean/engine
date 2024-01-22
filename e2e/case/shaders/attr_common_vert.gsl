vec3 POSITION;

#ifdef RENDERER_HAS_UV
    vec2 TEXCOORD_0;
#endif

#ifdef RENDERER_HAS_UV1
    vec2 TEXCOORD_1;
#endif

#ifdef RENDERER_HAS_SKIN
    vec4 JOINTS_0;
    vec4 WEIGHTS_0;
#endif

#ifdef RENDERER_ENABLE_VERTEXCOLOR
    vec4 COLOR_0;
#endif

#ifndef MATERIAL_OMIT_NORMAL
    #ifdef RENDERER_HAS_NORMAL
        vec3 NORMAL;
    #endif

    #ifdef RENDERER_HAS_TANGENT
        vec4 TANGENT;
    #endif
#endif