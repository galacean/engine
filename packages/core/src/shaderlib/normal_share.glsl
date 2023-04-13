#ifndef MATERIAL_OMIT_NORMAL
    #ifdef RENDERER_HAS_NORMAL
        varying vec3 v_normal;
        #if defined(RENDERER_HAS_TANGENT) && ( defined(MATERIAL_HAS_NORMALTEXTURE) || defined(HAS_CLEARCOATNORMALTEXTURE) )
            varying mat3 v_TBN;
        #endif
    #endif
#endif