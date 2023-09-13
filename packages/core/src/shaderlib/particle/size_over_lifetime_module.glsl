#ifdef RENDERER_SOL_CURVE_MODE
    uniform vec2 renderer_SOLMaxCurveX[4]; // x:time y:value
    #ifdef RENDERER_SOL_IS_SEPARATE
        uniform vec2 renderer_SOLMaxCurveY[4]; // x:time y:value
        uniform vec2 renderer_SOLMaxCurveZ[4]; // x:time y:value
    #endif

    #ifdef RENDERER_SOL_IS_RANDOM_TWO
        uniform vec2 renderer_SOLMinCurveX[4]; // x:time y:value
        #ifdef RENDERER_SOL_IS_SEPARATE
            uniform vec2 renderer_SOLMinCurveY[4]; // x:time y:value
            uniform vec2 renderer_SOLMinCurveZ[4]; // x:time y:value
        #endif
    #endif
#endif

vec2 computeParticleSizeBillboard(in vec2 size, in float normalizedAge) {
    #ifdef RENDERER_SOL_CURVE_MODE
        float lifeSizeX = evaluateParticleCurve(renderer_SOLMaxCurveX, normalizedAge);
        #ifdef RENDERER_SOL_IS_RANDOM_TWO
            lifeSizeX = mix(evaluateParticleCurve(renderer_SOLMinCurveX, normalizedAge), lifeSizeX, a_Random0.z);
        #endif

        #ifdef RENDERER_SOL_IS_SEPARATE
            float lifeSizeY = evaluateParticleCurve(renderer_SOLMaxCurveY, normalizedAge);
            #ifdef RENDERER_SOL_IS_RANDOM_TWO
                lifeSizeY = mix(evaluateParticleCurve(renderer_SOLMinCurveY, normalizedAge), lifeSizeY, a_Random0.z);
            #endif
            size *= vec2(lifeSizeX, lifeSizeY);
        #else
            size *= lifeSizeX;
        #endif
    #endif
    return size;
}

#ifdef RENDERER_MODE_MESH
    vec3 computeParticleSizeMesh(in vec3 size, in float normalizedAge) {
        #ifdef RENDERER_SOL_CURVE
            size *= evaluateParticleCurve(renderer_SOLMaxCurveX, normalizedAge);
        #endif
        #ifdef RENDERER_SOL_RANDOM_CURVES
            size *= mix(evaluateParticleCurve(renderer_SOLMaxCurveX, normalizedAge),
            evaluateParticleCurve(u_SOLSizeGradientMax, normalizedAge),
            a_Random0.z);
        #endif
        #ifdef RENDERER_SOL_CURVE_SEPARATE
            size *= vec3(evaluateParticleCurve(renderer_SOLMinCurveX, normalizedAge),
            evaluateParticleCurve(renderer_SOLMinCurveY, normalizedAge),
            evaluateParticleCurve(renderer_SOLMinCurveZ, normalizedAge));
        #endif
        #ifdef RENDERER_SOL_RANDOM_CURVES_SEPARATE
            size *= vec3(mix(evaluateParticleCurve(renderer_SOLMinCurveX, normalizedAge),
                    evaluateParticleCurve(renderer_SOLMaxCurveX, normalizedAge),
                    a_Random0.z),
            mix(evaluateParticleCurve(renderer_SOLMinCurveY, normalizedAge),
                evaluateParticleCurve(renderer_SOLMaxCurveY, normalizedAge),
                a_Random0.z),
            mix(evaluateParticleCurve(renderer_SOLMinCurveZ, normalizedAge),
                evaluateParticleCurve(renderer_SOLMaxCurveZ, normalizedAge),
                a_Random0.z));
        #endif
        return size;
    }
#endif