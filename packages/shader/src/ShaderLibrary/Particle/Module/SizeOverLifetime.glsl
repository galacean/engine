#ifndef SIZE_OVER_LIFETIME_INCLUDED
#define SIZE_OVER_LIFETIME_INCLUDED

#ifdef RENDERER_SOL_CURVE_MODE
    vec2 renderer_SOLMaxCurveX[4]; // x:time y:value
    #ifdef RENDERER_SOL_IS_SEPARATE
        vec2 renderer_SOLMaxCurveY[4]; // x:time y:value
        vec2 renderer_SOLMaxCurveZ[4]; // x:time y:value
    #endif

    #ifdef RENDERER_SOL_IS_RANDOM_TWO
        vec2 renderer_SOLMinCurveX[4]; // x:time y:value
        #ifdef RENDERER_SOL_IS_SEPARATE
            vec2 renderer_SOLMinCurveY[4]; // x:time y:value
            vec2 renderer_SOLMinCurveZ[4]; // x:time y:value
        #endif
    #endif
#endif

vec2 computeParticleSizeBillboard(Attributes attributes, in vec2 size, in float normalizedAge) {
    #ifdef RENDERER_SOL_CURVE_MODE
        float lifeSizeX = evaluateParticleCurve(renderer_SOLMaxCurveX, normalizedAge);
        #ifdef RENDERER_SOL_IS_RANDOM_TWO
            lifeSizeX = mix(evaluateParticleCurve(renderer_SOLMinCurveX, normalizedAge), lifeSizeX, attributes.a_Random0.z);
        #endif

        #ifdef RENDERER_SOL_IS_SEPARATE
            float lifeSizeY = evaluateParticleCurve(renderer_SOLMaxCurveY, normalizedAge);
            #ifdef RENDERER_SOL_IS_RANDOM_TWO
                lifeSizeY = mix(evaluateParticleCurve(renderer_SOLMinCurveY, normalizedAge), lifeSizeY, attributes.a_Random0.z);
            #endif
            size *= vec2(lifeSizeX, lifeSizeY);
        #else
            size *= lifeSizeX;
        #endif
    #endif
    return size;
}

#ifdef RENDERER_MODE_MESH
    vec3 computeParticleSizeMesh(Attributes attributes, in vec3 size, in float normalizedAge) {
        #ifdef RENDERER_SOL_CURVE_MODE
            float lifeSizeX = evaluateParticleCurve(renderer_SOLMaxCurveX, normalizedAge);
            #ifdef RENDERER_SOL_IS_RANDOM_TWO
                lifeSizeX = mix(evaluateParticleCurve(renderer_SOLMinCurveX, normalizedAge), lifeSizeX, attributes.a_Random0.z);
            #endif

            #ifdef RENDERER_SOL_IS_SEPARATE
                float lifeSizeY = evaluateParticleCurve(renderer_SOLMaxCurveY, normalizedAge);
                float lifeSizeZ = evaluateParticleCurve(renderer_SOLMaxCurveZ, normalizedAge);
                #ifdef RENDERER_SOL_IS_RANDOM_TWO
                    lifeSizeY = mix(evaluateParticleCurve(renderer_SOLMinCurveY, normalizedAge), lifeSizeY, attributes.a_Random0.z);
                    lifeSizeZ = mix(evaluateParticleCurve(renderer_SOLMinCurveZ, normalizedAge), lifeSizeZ, attributes.a_Random0.z);
                #endif
                size *= vec3(lifeSizeX, lifeSizeY, lifeSizeZ);
            #else
                size *= lifeSizeX;
            #endif
        #endif
        return size;
    }
#endif

#endif
