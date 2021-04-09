    #ifdef O3_HAS_NORMAL

        #if defined( O3_HAS_TANGENT ) && defined( O3_NORMAL_TEXTURE )

        vec3 normalW = normalize( mat3(u_normalMat) * normal.xyz );
        vec3 tangentW = normalize( mat3(u_normalMat) * tangent.xyz );
        vec3 bitangentW = cross( normalW, tangentW ) * tangent.w;
        v_TBN = mat3( tangentW, bitangentW, normalW );

        #else

        v_normal = normalize( mat3(u_normalMat) * normal );

        #endif

    #endif
