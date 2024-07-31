#ifndef MATERIAL_OMIT_NORMAL
    #ifdef RENDERER_HAS_NORMAL
        v_normal = normalize( mat3(renderer_NormalMat) * normal );

        #if defined(RENDERER_HAS_TANGENT) && ( defined(MATERIAL_HAS_NORMALTEXTURE) || defined(MATERIAL_HAS_CLEAR_COAT_NORMAL_TEXTURE) || defined(MATERIAL_ENABLE_ANISOTROPY) )
            vec3 tangentW = normalize( mat3(renderer_NormalMat) * tangent.xyz );
            vec3 bitangentW = cross( v_normal, tangentW ) * tangent.w;

            v_TBN = mat3( tangentW, bitangentW, v_normal );
        #endif
    #endif
#endif