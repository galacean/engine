#ifndef OMIT_NORMAL
    #ifdef GALACEAN_HAS_NORMAL
        varying vec3 v_normal;
        #if defined(GALACEAN_HAS_TANGENT) && ( defined(NORMALTEXTURE) || defined(HAS_CLEARCOATNORMALTEXTURE) )
            varying mat3 v_TBN;
        #endif
    #endif
#endif