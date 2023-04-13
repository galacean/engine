#if defined(SHADOW_TYPE) && defined(RENDERER_IS_RECEIVE_SHADOWS)
    #define GALACEAN_CALCULATE_SHADOWS
#endif

#ifdef GALACEAN_CALCULATE_SHADOWS
    #if CASCADED_COUNT==1
        #include <ShadowCoord>
        varying vec3 v_shadowCoord;
    #endif
#endif