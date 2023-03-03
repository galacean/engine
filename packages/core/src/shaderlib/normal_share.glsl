#ifndef OMIT_NORMAL
    #ifdef O3_HAS_NORMAL
        varying vec3 v_normal;
        #if defined(O3_HAS_TANGENT) && ( defined(NORMALTEXTURE) || defined(HAS_CLEARCOATNORMALTEXTURE) || defined(HAS_ANISOTROPY) )
            varying mat3 v_TBN;
        #endif
    #endif
#endif