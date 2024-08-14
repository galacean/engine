#if defined(RENDERER_TSA_FRAME_CONSTANT) || defined(RENDERER_TSA_FRAME_RANDOM_CONSTANT)|| defined(RENDERER_TSA_FRAME_CURVE) || defined(RENDERER_TSA_FRAME_RANDOM_CURVES)
    uniform float renderer_TSACycles;
    uniform vec3 renderer_TSATillingParams; // x:subU y:subV z:tileCount

    uniform float renderer_TSAFrameMaxConstant;
    uniform vec2 renderer_TSAFrameMaxCurve[4]; // x:time y:value

    #if  defined(RENDERER_TSA_FRAME_RANDOM_CONSTANT) || defined(RENDERER_TSA_FRAME_RANDOM_CURVES)
        uniform float renderer_TSAFrameMinConstant;
        uniform vec2 renderer_TSAFrameMinCurve[4]; // x:time y:value
    #endif
#endif

vec2 computeParticleUV(in vec2 uv, in float normalizedAge) {
    #if defined(RENDERER_TSA_FRAME_CONSTANT) || defined(RENDERER_TSA_FRAME_RANDOM_CONSTANT)|| defined(RENDERER_TSA_FRAME_CURVE) || defined(RENDERER_TSA_FRAME_RANDOM_CURVES) 
        float normalizedFrame;

        float scaledNormalizedAge = normalizedAge * renderer_TSACycles;
        float cycleNormalizedAge = scaledNormalizedAge - floor(scaledNormalizedAge);

        #if defined(RENDERER_TSA_FRAME_CONSTANT) || defined(RENDERER_TSA_FRAME_RANDOM_CONSTANT)
            normalizedFrame = renderer_TSAFrameMaxConstant;
            #ifdef RENDERER_TSA_FRAME_RANDOM_CONSTANT
                normalizedFrame = mix(renderer_TSAFrameMinConstant, normalizedFrame, cycleNormalizedAge);
            #endif
        #endif
    
        #if defined(RENDERER_TSA_FRAME_CURVE) || defined(RENDERER_TSA_FRAME_RANDOM_CURVES)
            normalizedFrame = evaluateParticleCurve(renderer_TSAFrameMaxCurve, cycleNormalizedAge);
            #ifdef RENDERER_TSA_FRAME_RANDOM_CURVES
                normalizedFrame = mix(evaluateParticleCurve(renderer_TSAFrameMinCurve, cycleNormalizedAge), normalizedFrame, a_Random1.x);
            #endif
        #endif

        float frame = floor(normalizedFrame + a_SimulationUV.z);
        float totalULength = frame * renderer_TSATillingParams.x;
        float floorTotalULength = floor(totalULength);
        uv.x += totalULength - floorTotalULength;
        uv.y += floorTotalULength * renderer_TSATillingParams.y;
    #endif
    
    return uv;
}
