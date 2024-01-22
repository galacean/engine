#if SCENE_FOG_MODE != 0
    vec4 scene_FogColor;
    vec4 scene_FogParams;// (-1/(end-start), end/(end-start), density/ln(2),density/sprt(ln(2)));

    float ComputeFogIntensity(float fogDepth){
        #if SCENE_FOG_MODE == 1
            // (end-z) / (end-start) = z * (-1/(end-start)) + (end/(end-start))
            return clamp(fogDepth * scene_FogParams.x + scene_FogParams.y, 0.0, 1.0);
        #elif SCENE_FOG_MODE == 2
            // exp(-z * density) = exp2((-z * density)/ln(2)) = exp2(-z * density/ln(2))
            return  clamp(exp2(-fogDepth * scene_FogParams.z), 0.0, 1.0);
        #elif SCENE_FOG_MODE == 3
            // exp(-(z * density)^2) = exp2(-(z * density)^2/ln(2)) = exp2(-(z * density/sprt(ln(2)))^2)
            float factor = fogDepth * scene_FogParams.w;
            return  clamp(exp2(-factor * factor), 0.0, 1.0);
        #endif
    }
#endif
