#ifdef SCENE_IS_CALCULATE_SHADOWS
    #if SCENE_SHADOW_CASCADED_COUNT == 1
        v_shadowCoord = getShadowCoord();
    #endif
#endif