#ifndef MATERIAL_OMIT_NORMAL
    #ifdef RENDERER_HAS_NORMAL
        v_normal = normalize( mat3(renderer_NormalMat) * normal );

        #if defined(RENDERER_HAS_TANGENT) && ( defined(MATERIAL_HAS_NORMALTEXTURE) || defined(HAS_CLEARCOATNORMALTEXTURE) )
            vec3 normalW = normalize( mat3(renderer_NormalMat) * normal.xyz );
            vec3 tangentW = normalize( mat3(renderer_NormalMat) * tangent.xyz );
            vec3 bitangentW = cross( normalW, tangentW ) * tangent.w;

            v_TBN = mat3( tangentW, bitangentW, normalW );
        #endif
    #endif
#endif