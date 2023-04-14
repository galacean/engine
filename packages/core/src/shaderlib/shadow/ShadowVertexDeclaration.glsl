#if defined(SCENE_SHADOW_TYPE) && defined(RENDERER_IS_RECEIVE_SHADOWS)
    #define SCENE_IS_CALCULATE_SHADOWS
#endif

#ifdef SCENE_IS_CALCULATE_SHADOWS
    #if SCENE_SHADOW_CASCADED_COUNT==1
        #include <ShadowCoord>
        varying vec3 v_shadowCoord;
    #endif
#endif