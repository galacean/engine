#ifndef MATERIAL_OMIT_NORMAL
    #ifdef RENDERER_HAS_NORMAL
        mat3 normalMat = mat3(renderer_NormalMat);
        v_normal = normalize( normalMat * normal );

        #if defined(RENDERER_HAS_TANGENT) && ( defined(MATERIAL_HAS_NORMALTEXTURE) || defined(MATERIAL_HAS_CLEAR_COAT_NORMAL_TEXTURE) || defined(MATERIAL_ENABLE_ANISOTROPY) )
            vec3 tangentW = normalize( normalMat * tangent.xyz );
            vec3 bitangentW = cross( v_normal, tangentW ) * tangent.w;

            v_TBN = mat3( tangentW, bitangentW, v_normal );
        #endif
    #endif
#endif