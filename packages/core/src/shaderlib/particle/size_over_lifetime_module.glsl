#if defined(RENDERER_SOL_CURVE) || defined(RENDERER_SOL_RANDOM_CURVES)
    uniform vec2 renderer_SOLMaxCurveX[4]; // x:time y:value
#endif

#ifdef RENDERER_SOL_RANDOM_CURVES
    uniform vec2 renderer_SOLMinCurveX[4]; // x:time y:value
#endif

#if defined(RENDERER_SOL_CURVE_SEPARATE) || defined(RENDERER_SOL_RANDOM_CURVES_SEPARATE)
    uniform vec2 renderer_SOLMaxCurveY[4]; // x:time y:value
    uniform vec2 renderer_SOLMaxCurveZ[4]; // x:time y:value
#endif

#ifdef RENDERER_SOL_RANDOM_CURVES_SEPARATE
    uniform vec2 renderer_SOLMimCurveY[4]; // x:time y:value
    uniform vec2 renderer_SOLMinCurveZ[4]; // x:time y:value
#endif

#if defined(VELOCITY_OVER_LIFETIME_CURVE) || defined(VELOCITY_OVER_LIFETIME_RANDOM_CURVE) || defined(RENDERER_SOL_CURVE) || defined(RENDERER_SOL_CURVE_SEPARATE) || defined(RENDERER_SOL_RANDOM_CURVES) || defined(SIZE_OVER_LIFETIME_RANDOM_CURVE_SEPARATE)
    float getCurValueFromGradientFloat(in vec2 gradientNumbers[4], in float normalizedAge) {
        float curValue;
        for (int i = 1; i < 4; i++) {
        vec2 gradientNumber = gradientNumbers[i];
        float key = gradientNumber.x;
        if (key >= normalizedAge) {
            vec2 lastGradientNumber = gradientNumbers[i - 1];
            float lastKey = lastGradientNumber.x;
            float age = (normalizedAge - lastKey) / (key - lastKey);
            curValue = mix(lastGradientNumber.y, gradientNumber.y, age);
            break;
        }
        }
        return curValue;
    }
#endif

vec2 computeParticleSizeBillboard(in vec2 size, in float normalizedAge) {
#ifdef RENDERER_SOL_CURVE
    size *= getCurValueFromGradientFloat(u_SOLSizeGradient, normalizedAge);
#endif
#ifdef RENDERER_SOL_RANDOM_CURVES
    size *= mix(getCurValueFromGradientFloat(u_SOLSizeGradient, normalizedAge),
	getCurValueFromGradientFloat(u_SOLSizeGradientMax, normalizedAge),
	a_Random0.z);
#endif
#ifdef RENDERER_SOL_CURVE_SEPARATE
    size *= vec2(getCurValueFromGradientFloat(renderer_SOLMinCurveX, normalizedAge),
	getCurValueFromGradientFloat(renderer_SOLMinCurveY, normalizedAge));
#endif
#ifdef SIZE_OVER_LIFETIME_RANDOM_CURVE_SEPARATE
    size *= vec2(mix(getCurValueFromGradientFloat(renderer_SOLMinCurveX, normalizedAge),
		     getCurValueFromGradientFloat(renderer_SOLMaxCurveX, normalizedAge),
		     a_Random0.z),
	mix(getCurValueFromGradientFloat(renderer_SOLMinCurveY, normalizedAge),
	    getCurValueFromGradientFloat(renderer_SOLMaxCurveY, normalizedAge),
	    a_Random0.z));
#endif
    return size;
}

#ifdef RENDERER_MODE_MESH
vec3 computeParticleSizeMesh(in vec3 size, in float normalizedAge) {
    #ifdef RENDERER_SOL_CURVE
        size *= getCurValueFromGradientFloat(u_SOLSizeGradient, normalizedAge);
    #endif
    #ifdef RENDERER_SOL_RANDOM_CURVES
        size *= mix(getCurValueFromGradientFloat(u_SOLSizeGradient, normalizedAge),
        getCurValueFromGradientFloat(u_SOLSizeGradientMax, normalizedAge),
        a_Random0.z);
    #endif
    #ifdef RENDERER_SOL_CURVE_SEPARATE
        size *= vec3(getCurValueFromGradientFloat(renderer_SOLMinCurveX, normalizedAge),
        getCurValueFromGradientFloat(renderer_SOLMinCurveY, normalizedAge),
        getCurValueFromGradientFloat(renderer_SOLMinCurveZ, normalizedAge));
    #endif
    #ifdef RENDERER_SOL_RANDOM_CURVES_SEPARATE
        size *= vec3(mix(getCurValueFromGradientFloat(renderer_SOLMinCurveX, normalizedAge),
                 getCurValueFromGradientFloat(renderer_SOLMaxCurveX, normalizedAge),
                 a_Random0.z),
        mix(getCurValueFromGradientFloat(renderer_SOLMinCurveY, normalizedAge),
            getCurValueFromGradientFloat(renderer_SOLMaxCurveY, normalizedAge),
            a_Random0.z),
        mix(getCurValueFromGradientFloat(renderer_SOLMinCurveZ, normalizedAge),
            getCurValueFromGradientFloat(renderer_SOLMaxCurveZ, normalizedAge),
            a_Random0.z));
    #endif
    return size;
}
#endif