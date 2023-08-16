#if defined(TEXTURE_SHEET_ANIMATION_CURVE) || defined(TEXTURE_SHEET_ANIMATION_RANDOM_CURVE)
    uniform float u_TSACycles;
    uniform vec2 u_TSASubUVLength;
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
            float key = gradientFrame.x;
            if (key >= normalizedAge) {
                vec2 lastGradientFrame = gradientFrames[i - 1];
                float lastKey = lastGradientFrame.x;
                float age = (normalizedAge - lastKey) / (key - lastKey);
                overTimeFrame = mix(lastGradientFrame.y, gradientFrame.y, age);
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
        float totalULength = frame * u_TSASubUVLength.x;
        float floorTotalULength = floor(totalULength);
        uv.x += totalULength - floorTotalULength;
        uv.y += floorTotalULength * u_TSASubUVLength.y;
    #endif

    #ifdef TEXTURE_SHEET_ANIMATION_RANDOM_CURVE
        float cycleNormalizedAge = normalizedAge * u_TSACycles;
        float uvNormalizedAge = cycleNormalizedAge - floor(cycleNormalizedAge);
        float frame = floor(mix(getFrameFromGradient(u_TSAGradientUVs, uvNormalizedAge),
        getFrameFromGradient(u_TSAMaxCurve, uvNormalizedAge),a_Random1.x));
        float totalULength = frame * u_TSASubUVLength.x;
        float floorTotalULength = floor(totalULength);
        uv.x += totalULength - floorTotalULength;
        uv.y += floorTotalULength * u_TSASubUVLength.y;
    #endif
   
    return uv;
}
