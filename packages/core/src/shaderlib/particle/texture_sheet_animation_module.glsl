#if defined(RENDERER_TSA_FRAME_CURVE) || defined(RENDERER_TSA_FRAME_RANDOM_CURVES)
    uniform float renderer_TSACycles;
    uniform vec3 renderer_TSATillingParams; // x:subU y:subV z:tileCount
    uniform vec2 renderer_TSAFrameMaxCurve[4]; // x:time y:value

    #ifdef RENDERER_TSA_FRAME_RANDOM_CURVES
        uniform vec2 renderer_TSAFrameMinCurve[4]; // x:time y:value
    #endif
#endif

vec2 computeParticleUV(in vec2 uv, in float normalizedAge) {
    #if defined(RENDERER_TSA_FRAME_CURVE) || defined(RENDERER_TSA_FRAME_RANDOM_CURVES)
        float frameOverlifetime;

        float scaledNormalizedAge = normalizedAge * renderer_TSACycles;
        float cycleNormalizedAge = scaledNormalizedAge - floor(scaledNormalizedAge);
        frameOverlifetime = evaluateParticleCurve(renderer_TSAFrameMaxCurve, cycleNormalizedAge);
        
        #ifdef RENDERER_TSA_FRAME_RANDOM_CURVES
            frameOverlifetime = mix(evaluateParticleCurve(renderer_TSAFrameMinCurve, cycleNormalizedAge), frameOverlifetime, a_Random1.x);
        #endif

        float frame = floor(frameOverlifetime);
        float totalULength = frame * renderer_TSATillingParams.x;
        float floorTotalULength = floor(totalULength);
        uv.x += totalULength - floorTotalULength;
        uv.y += floorTotalULength * renderer_TSATillingParams.y;
    #endif
    return uv;
}
