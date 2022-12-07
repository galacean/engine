#if defined(SHADOW_TYPE) && defined(OASIS_RECEIVE_SHADOWS)
    #define OASIS_CALCULATE_SHADOWS
#endif

#ifdef OASIS_CALCULATE_SHADOWS
    v_shadowCoord = getShadowCoord();
#endif