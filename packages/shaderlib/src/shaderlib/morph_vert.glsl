    #ifdef R3_HAS_MORPH

        #if defined( R3_MORPH_POSITION )

        position.xyz += u_morphWeights[ 0 ] * a_position0;

            #if R3_MORPH_NUM > 1

            position.xyz += u_morphWeights[ 1 ] * a_position1;

            #endif

            #if R3_MORPH_NUM > 2

            position.xyz += u_morphWeights[ 2 ] * a_position2;

            #endif

            #if R3_MORPH_NUM > 3

            position.xyz += u_morphWeights[ 3 ] * a_position3;

            #endif

            #if R3_MORPH_NUM > 4

            position.xyz += u_morphWeights[ 4 ] * a_position4;

            #endif

            #if R3_MORPH_NUM > 5

            position.xyz += u_morphWeights[ 5 ] * a_position5;

            #endif

            #if R3_MORPH_NUM > 6

            position.xyz += u_morphWeights[ 6 ] * a_position6;

            #endif

            #if R3_MORPH_NUM > 7

            position.xyz += u_morphWeights[ 7 ] * a_position7;

            #endif

        #endif

        #if defined( R3_HAS_NORMAL ) && defined( R3_MORPH_NORMAL )

        normal.xyz += u_morphWeights[ 0 ] * a_normal0;

            #if R3_MORPH_NUM > 1

            normal.xyz += u_morphWeights[ 1 ] * a_normal1;

            #endif

            #if R3_MORPH_NUM > 2

            normal.xyz += u_morphWeights[ 2 ] * a_normal2;

            #endif

            #if R3_MORPH_NUM > 3

            normal.xyz += u_morphWeights[ 3 ] * a_normal3;

            #endif

            #if R3_MORPH_NUM > 4

            normal.xyz += u_morphWeights[ 4 ] * a_normal4;

            #endif

            #if R3_MORPH_NUM > 5

            normal.xyz += u_morphWeights[ 5 ] * a_normal5;

            #endif

            #if R3_MORPH_NUM > 6

            normal.xyz += u_morphWeights[ 6 ] * a_normal6;

            #endif

            #if R3_MORPH_NUM > 7

            normal.xyz += u_morphWeights[ 7 ] * a_normal7;

            #endif

        #endif

        #if defined( R3_HAS_TANGENT ) && defined( R3_MORPH_TANGENT ) && defined( R3_HAS_NORMALMAP )

        tangent.xyz += u_morphWeights[ 0 ] * a_tangent0;

            #if R3_MORPH_NUM > 1

            tangent.xyz += u_morphWeights[ 1 ] * a_tangent1;

            #endif

            #if R3_MORPH_NUM > 2

            tangent.xyz += u_morphWeights[ 2 ] * a_tangent2;

            #endif

            #if R3_MORPH_NUM > 3

            tangent.xyz += u_morphWeights[ 3 ] * a_tangent3;

            #endif

            #if R3_MORPH_NUM > 4

            tangent.xyz += u_morphWeights[ 4 ] * a_tangent4;

            #endif

            #if R3_MORPH_NUM > 5

            tangent.xyz += u_morphWeights[ 5 ] * a_tangent5;

            #endif

            #if R3_MORPH_NUM > 6

            tangent.xyz += u_morphWeights[ 6 ] * a_tangent6;

            #endif

            #if R3_MORPH_NUM > 7

            tangent.xyz += u_morphWeights[ 7 ] * a_tangent7;

            #endif

        #endif

    #endif
