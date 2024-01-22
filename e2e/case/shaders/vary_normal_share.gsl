#ifndef MATERIAL_OMIT_NORMAL
    #ifdef RENDERER_HAS_NORMAL
        vec3 v_normal;
        #if defined(RENDERER_HAS_TANGENT) && ( defined(MATERIAL_HAS_NORMALTEXTURE) || defined(MATERIAL_HAS_CLEAR_COAT_NORMAL_TEXTURE) || defined(MATERIAL_ENABLE_ANISOTROPY) )
            mat3 v_TBN;
        #endif
    #endif
#endif