#ifdef O3_HAS_FOG

varying vec3 v_fogDepth;

uniform O3_VERTEX_PRECISION vec3 u_fogColor;

    #ifdef O3_FOG_EXP2

        uniform O3_VERTEX_PRECISION float u_fogDensity;

    #else

        uniform O3_VERTEX_PRECISION float u_fogNear;
        uniform O3_VERTEX_PRECISION float u_fogFar;

    #endif

#endif
