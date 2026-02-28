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
        float scaledNormalizedAge = normalizedAge * renderer_TSACycles;
        float cycleNormalizedAge = scaledNormalizedAge - floor(scaledNormalizedAge);
        float normalizedFrame = evaluateParticleCurve(renderer_TSAFrameMaxCurve, cycleNormalizedAge);
        #ifdef RENDERER_TSA_FRAME_RANDOM_CURVES
            normalizedFrame = mix(evaluateParticleCurve(renderer_TSAFrameMinCurve, cycleNormalizedAge), normalizedFrame, a_Random1.x);
        #endif

        float frame = floor(normalizedFrame * renderer_TSATillingParams.z);

        float tileRow = frame * renderer_TSATillingParams.x;
        float tileRowIndex = floor(tileRow);
        uv.x += tileRow - tileRowIndex;
        uv.y += tileRowIndex * renderer_TSATillingParams.y;
    #endif
    
    return uv;
}
