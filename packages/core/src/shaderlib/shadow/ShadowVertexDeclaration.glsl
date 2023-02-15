#if defined(SHADOW_TYPE) && defined(OASIS_RECEIVE_SHADOWS)
    #define OASIS_CALCULATE_SHADOWS
#endif

#ifdef OASIS_CALCULATE_SHADOWS
    #if CASCADED_COUNT==1
        #include <ShadowCoord>
        varying vec3 v_shadowCoord;
    #endif
#endif