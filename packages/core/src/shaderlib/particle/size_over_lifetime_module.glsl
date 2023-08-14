#if defined(SIZE_OVER_LIFETIME_CURVE) || defined(SIZE_OVER_LIFETIME_RANDOM_CURVES)
    uniform vec2 u_SOLSizeGradient[4]; // x为key,y为尺寸
#endif
#ifdef SIZE_OVER_LIFETIME_RANDOM_CURVES
    uniform vec2 u_SOLSizeGradientMax[4]; // x为key,y为尺寸
#endif
#if defined(SIZE_OVER_LIFETIME_CURVE_SEPARATE) || defined(SIZE_OVER_LIFETIME_RANDOM_CURVE_SEPARATE)
    uniform vec2 u_SOLSizeGradientX[4]; // x为key,y为尺寸
    uniform vec2 u_SOLSizeGradientY[4]; // x为key,y为尺寸
    uniform vec2 u_SOLSizeGradientZ[4]; // x为key,y为尺寸
#endif
#ifdef SIZE_OVER_LIFETIME_RANDOM_CURVE_SEPARATE
    uniform vec2 u_SOLSizeGradientMaxX[4]; // x为key,y为尺寸
    uniform vec2 u_SOLSizeGradientMaxY[4]; // x为key,y为尺寸
    uniform vec2 u_SOLSizeGradientMaxZ[4]; // x为key,y为尺寸
#endif

#if defined(VELOCITY_OVER_LIFETIME_CURVE) || defined(VELOCITY_OVER_LIFETIME_RANDOM_CURVE) || defined(SIZE_OVER_LIFETIME_CURVE) || defined(SIZE_OVER_LIFETIME_CURVE_SEPARATE) || defined(SIZE_OVER_LIFETIME_RANDOM_CURVES) || defined(SIZE_OVER_LIFETIME_RANDOM_CURVE_SEPARATE)
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
#ifdef SIZE_OVER_LIFETIME_CURVE
    size *= getCurValueFromGradientFloat(u_SOLSizeGradient, normalizedAge);
#endif
#ifdef SIZE_OVER_LIFETIME_RANDOM_CURVES
    size *= mix(getCurValueFromGradientFloat(u_SOLSizeGradient, normalizedAge),
	getCurValueFromGradientFloat(u_SOLSizeGradientMax, normalizedAge),
	a_Random0.z);
#endif
#ifdef SIZE_OVER_LIFETIME_CURVE_SEPARATE
    size *= vec2(getCurValueFromGradientFloat(u_SOLSizeGradientX, normalizedAge),
	getCurValueFromGradientFloat(u_SOLSizeGradientY, normalizedAge));
#endif
#ifdef SIZE_OVER_LIFETIME_RANDOM_CURVE_SEPARATE
    size *= vec2(mix(getCurValueFromGradientFloat(u_SOLSizeGradientX, normalizedAge),
		     getCurValueFromGradientFloat(u_SOLSizeGradientMaxX, normalizedAge),
		     a_Random0.z),
	mix(getCurValueFromGradientFloat(u_SOLSizeGradientY, normalizedAge),
	    getCurValueFromGradientFloat(u_SOLSizeGradientMaxY, normalizedAge),
	    a_Random0.z));
#endif
    return size;
}

#ifdef RENDERER_MODE_MESH
vec3 computeParticleSizeMesh(in vec3 size, in float normalizedAge) {
    #ifdef SIZE_OVER_LIFETIME_CURVE
        size *= getCurValueFromGradientFloat(u_SOLSizeGradient, normalizedAge);
    #endif
    #ifdef SIZE_OVER_LIFETIME_RANDOM_CURVES
        size *= mix(getCurValueFromGradientFloat(u_SOLSizeGradient, normalizedAge),
        getCurValueFromGradientFloat(u_SOLSizeGradientMax, normalizedAge),
        a_Random0.z);
    #endif
    #ifdef SIZE_OVER_LIFETIME_CURVE_SEPARATE
        size *= vec3(getCurValueFromGradientFloat(u_SOLSizeGradientX, normalizedAge),
        getCurValueFromGradientFloat(u_SOLSizeGradientY, normalizedAge),
        getCurValueFromGradientFloat(u_SOLSizeGradientZ, normalizedAge));
    #endif
    #ifdef SIZE_OVER_LIFETIME_RANDOM_CURVES_SEPARATE
        size *= vec3(mix(getCurValueFromGradientFloat(u_SOLSizeGradientX, normalizedAge),
                 getCurValueFromGradientFloat(u_SOLSizeGradientMaxX, normalizedAge),
                 a_Random0.z),
        mix(getCurValueFromGradientFloat(u_SOLSizeGradientY, normalizedAge),
            getCurValueFromGradientFloat(u_SOLSizeGradientMaxY, normalizedAge),
            a_Random0.z),
        mix(getCurValueFromGradientFloat(u_SOLSizeGradientZ, normalizedAge),
            getCurValueFromGradientFloat(u_SOLSizeGradientMaxZ, normalizedAge),
            a_Random0.z));
    #endif
    return size;
}
#endif