#ifdef R3_HAS_FOG

varying vec3 v_fogDepth;

uniform R3_VERTEX_PRECISION vec3 u_fogColor;

    #ifdef R3_FOG_EXP2

        uniform R3_VERTEX_PRECISION float u_fogDensity;

    #else

        uniform R3_VERTEX_PRECISION float u_fogNear;
        uniform R3_VERTEX_PRECISION float u_fogFar;

    #endif

#endif
