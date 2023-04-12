#ifndef OMIT_NORMAL
    #ifdef GALACEAN_HAS_NORMAL
        v_normal = normalize( mat3(galacean_NormalMat) * normal );

        #if defined(GALACEAN_HAS_TANGENT) && ( defined(NORMALTEXTURE) || defined(HAS_CLEARCOATNORMALTEXTURE) )
            vec3 normalW = normalize( mat3(galacean_NormalMat) * normal.xyz );
            vec3 tangentW = normalize( mat3(galacean_NormalMat) * tangent.xyz );
            vec3 bitangentW = cross( normalW, tangentW ) * tangent.w;

            v_TBN = mat3( tangentW, bitangentW, normalW );
        #endif
    #endif
#endif