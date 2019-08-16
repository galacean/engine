#ifdef R3_HAS_MORPH

    uniform float u_morphWeights[ R3_MORPH_NUM ];

    #ifdef R3_MORPH_POSITION

    attribute vec3 a_position0;

    #endif

    #ifdef R3_MORPH_NORMAL

    attribute vec3 a_normal0;

    #endif

    #ifdef R3_MORPH_TANGENT

    attribute vec3 a_tangent0;

    #endif

    #if R3_MORPH_NUM > 1

        #ifdef R3_MORPH_POSITION

        attribute vec3 a_position1;

        #endif

        #ifdef R3_MORPH_NORMAL

        attribute vec3 a_normal1;

        #endif

        #ifdef R3_MORPH_TANGENT

        attribute vec3 a_tangent1;

        #endif

    #endif

    #if R3_MORPH_NUM > 2

        #ifdef R3_MORPH_POSITION

        attribute vec3 a_position2;

        #endif

        #ifdef R3_MORPH_NORMAL

        attribute vec3 a_normal2;

        #endif

        #ifdef R3_MORPH_TANGENT

        attribute vec3 a_tangent2;

        #endif

    #endif

    #if R3_MORPH_NUM > 3

        #ifdef R3_MORPH_POSITION

        attribute vec3 a_position3;

        #endif

        #ifdef R3_MORPH_NORMAL

        attribute vec3 a_normal3;

        #endif

        #ifdef R3_MORPH_TANGENT

        attribute vec3 a_tangent3;

        #endif

    #endif

    #if R3_MORPH_NUM > 4

        #ifdef R3_MORPH_POSITION

        attribute vec3 a_position4;

        #endif

        #ifdef R3_MORPH_NORMAL

        attribute vec3 a_normal4;

        #endif

        #ifdef R3_MORPH_TANGENT

        attribute vec3 a_tangent4;

        #endif

    #endif

    #if R3_MORPH_NUM > 5

        #ifdef R3_MORPH_POSITION

        attribute vec3 a_position5;

        #endif

        #ifdef R3_MORPH_NORMAL

        attribute vec3 a_normal5;

        #endif

        #ifdef R3_MORPH_TANGENT

        attribute vec3 a_tangent5;

        #endif

    #endif

    #if R3_MORPH_NUM > 6

        #ifdef R3_MORPH_POSITION

        attribute vec3 a_position6;

        #endif

        #ifdef R3_MORPH_NORMAL

        attribute vec3 a_normal6;

        #endif

        #ifdef R3_MORPH_TANGENT

        attribute vec3 a_tangent6;

        #endif

    #endif

    #if R3_MORPH_NUM > 7

        #ifdef R3_MORPH_POSITION

        attribute vec3 a_position7;

        #endif

        #ifdef R3_MORPH_NORMAL

        attribute vec3 a_normal7;

        #endif

        #ifdef R3_MORPH_TANGENT

        attribute vec3 a_tangent7;

        #endif

    #endif

#endif
