#if GALACEAN_FOG_MODE != 0
    varying vec3 v_positionVS;

    uniform vec4 galacean_FogColor;
    uniform vec4 galacean_FogParams;// (-1/(end-start), end/(end-start), density/ln(2),density/sprt(ln(2)));

    float ComputeFogIntensity(float fogDepth){
        #if GALACEAN_FOG_MODE == 1
            // (end-z) / (end-start) = z * (-1/(end-start)) + (end/(end-start))
            return clamp(fogDepth * galacean_FogParams.x + galacean_FogParams.y, 0.0, 1.0);
        #elif GALACEAN_FOG_MODE == 2
            // exp(-z * density) = exp2((-z * density)/ln(2)) = exp2(-z * density/ln(2))
            return  clamp(exp2(-fogDepth * galacean_FogParams.z), 0.0, 1.0);
        #elif GALACEAN_FOG_MODE == 3
            // exp(-(z * density)^2) = exp2(-(z * density)^2/ln(2)) = exp2(-(z * density/sprt(ln(2)))^2)
            float factor = fogDepth * galacean_FogParams.w;
            return  clamp(exp2(-factor * factor), 0.0, 1.0);
        #endif
    }
#endif
