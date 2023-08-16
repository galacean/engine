#if defined(TEXTURE_SHEET_ANIMATION_CURVE) || defined(TEXTURE_SHEET_ANIMATION_RANDOM_CURVE)
    uniform float u_TSACycles;
    uniform vec3 u_TSATillingInfo; // x:subU, y:subV, z:tileCount
    uniform vec2 u_TSAMaxCurve[4]; // x is time, y is value
#endif

#ifdef TEXTURE_SHEET_ANIMATION_RANDOM_CURVE
    uniform vec2 u_TSAMinCurve[4]; // x is time, y is value
#endif


#if defined(TEXTURE_SHEET_ANIMATION_CURVE) || defined(TEXTURE_SHEET_ANIMATION_RANDOM_CURVE)
    float getFrameFromGradient(in vec2 gradientFrames[4], in float normalizedAge) {
        float overTimeFrame;
        for (int i = 1; i < 4; i++) {
            vec2 gradientFrame = gradientFrames[i];
            float time = gradientFrame.x;
            if (time >= normalizedAge) {
                vec2 lastGradientFrame = gradientFrames[i - 1];
                float lastTime = lastGradientFrame.x;
                float age = (normalizedAge - lastTime) / (time - lastTime);
                overTimeFrame = mix(lastGradientFrame.y, gradientFrame.y, age) * u_TSATillingInfo.z;
                break;
            }
        }
        return floor(overTimeFrame);
    }
#endif

vec2 computeParticleUV(in vec2 uv, in float normalizedAge) {
    #ifdef TEXTURE_SHEET_ANIMATION_CURVE
        float cycleNormalizedAge = normalizedAge * u_TSACycles;
        float frame = getFrameFromGradient(u_TSAMaxCurve, cycleNormalizedAge - floor(cycleNormalizedAge));
        float totalULength = frame * u_TSATillingInfo.x;
        float floorTotalULength = floor(totalULength);
        uv.x += totalULength - floorTotalULength;
        uv.y += floorTotalULength * u_TSATillingInfo.y;
    #endif

    #ifdef TEXTURE_SHEET_ANIMATION_RANDOM_CURVE
        float cycleNormalizedAge = normalizedAge * u_TSACycles;
        float uvNormalizedAge = cycleNormalizedAge - floor(cycleNormalizedAge);
        float frame = floor(mix(getFrameFromGradient(u_TSAGradientUVs, uvNormalizedAge),
        getFrameFromGradient(u_TSAMaxCurve, uvNormalizedAge),a_Random1.x));
        float totalULength = frame * u_TSATillingInfo.x;
        float floorTotalULength = floor(totalULength);
        uv.x += totalULength - floorTotalULength;
        uv.y += floorTotalULength * u_TSATillingInfo.y;
    #endif
   
    return uv;
}
