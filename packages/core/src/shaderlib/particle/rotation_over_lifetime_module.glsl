#ifdef ROTATION_OVER_LIFETIME
    #if defined(ROTATION_OVER_LIFETIME_CONSTANT) || defined(ROTATION_OVER_LIFETIME_RANDOM_CONSTANTS)
        uniform float u_ROLAngularVelocityConst;
    #endif
    #ifdef ROTATION_OVER_LIFETIME_RANDOM_CONSTANTS
        uniform float u_ROLAngularVelocityConstMax;
    #endif
    #if defined(ROTATION_OVER_LIFETIME_CURVE) || defined(ROTATION_OVER_LIFETIME_RANDOM_CURVES)
        uniform vec2 u_ROLAngularVelocityGradient[4]; // x为key,y为旋转
    #endif
    #ifdef ROTATION_OVER_LIFETIME_RANDOM_CURVES
        uniform vec2 u_ROLAngularVelocityGradientMax[4]; // x为key,y为旋转
    #endif
#endif
#ifdef ROTATION_OVER_LIFETIME_SEPARATE
    #if defined(ROTATION_OVER_LIFETIME_CONSTANT) || defined(ROTATION_OVER_LIFETIME_RANDOM_CONSTANTS)
        uniform vec3 u_ROLAngularVelocityConstSeparate;
    #endif
    #ifdef ROTATION_OVER_LIFETIME_RANDOM_CONSTANTS
        uniform vec3 u_ROLAngularVelocityConstMaxSeparate;
    #endif
    #if defined(ROTATION_OVER_LIFETIME_CURVE) || defined(ROTATION_OVER_LIFETIME_RANDOM_CURVES)
        uniform vec2 u_ROLAngularVelocityGradientX[4];
        uniform vec2 u_ROLAngularVelocityGradientY[4];
        uniform vec2 u_ROLAngularVelocityGradientZ[4];
    #endif
    #ifdef ROTATION_OVER_LIFETIME_RANDOM_CURVES
        uniform vec2 u_ROLAngularVelocityGradientMaxX[4];
        uniform vec2 u_ROLAngularVelocityGradientMaxY[4];
        uniform vec2 u_ROLAngularVelocityGradientMaxZ[4];
        uniform vec2 u_ROLAngularVelocityGradientMaxW[4];
    #endif
#endif

#if defined(RENDERER_VOL_CURVE) || defined(RENDERER_VOL_RANDOM_CURVE) || defined(ROTATION_OVER_LIFETIME_CURVE) || defined(ROTATION_OVER_LIFETIME_RANDOM_CURVES)
float getTotalValueFromGradientFloat(in vec2 gradientNumbers[4], in float normalizedAge) {
    float totalValue = 0.0;
    for (int i = 1; i < 4; i++) {
	vec2 gradientNumber = gradientNumbers[i];
	float key = gradientNumber.x;
	vec2 lastGradientNumber = gradientNumbers[i - 1];
	float lastValue = lastGradientNumber.y;

	if (key >= normalizedAge) {
	    float lastKey = lastGradientNumber.x;
	    float age = (normalizedAge - lastKey) / (key - lastKey);
	    totalValue += (lastValue + mix(lastValue, gradientNumber.y, age)) / 2.0 * a_ShapePositionStartLifeTime.w * (normalizedAge - lastKey);
	    break;
	} else {
	    totalValue += (lastValue + gradientNumber.y) / 2.0 * a_ShapePositionStartLifeTime.w * (key - lastGradientNumber.x);
	}
    }
    return totalValue;
}
#endif

float computeParticleRotationFloat(in float rotation,
    in float age,
    in float normalizedAge) {
#ifdef ROTATION_OVER_LIFETIME
    #ifdef ROTATION_OVER_LIFETIME_CONSTANT
        float ageRot = u_ROLAngularVelocityConst * age;
        rotation += ageRot;
    #endif
    #ifdef ROTATION_OVER_LIFETIME_CURVE
        rotation += getTotalValueFromGradientFloat(u_ROLAngularVelocityGradient, normalizedAge);
    #endif
    #ifdef ROTATION_OVER_LIFETIME_RANDOM_CONSTANTS
        float ageRot = mix(u_ROLAngularVelocityConst, u_ROLAngularVelocityConstMax, a_Random0.w) * age;
        rotation += ageRot;
    #endif
    #ifdef ROTATION_OVER_LIFETIME_RANDOM_CURVES
        rotation += mix(
        getTotalValueFromGradientFloat(u_ROLAngularVelocityGradient, normalizedAge),
        getTotalValueFromGradientFloat(u_ROLAngularVelocityGradientMax,
            normalizedAge),
        a_Random0.w);
    #endif
#endif
#ifdef ROTATION_OVER_LIFETIME_SEPARATE
    #ifdef ROTATION_OVER_LIFETIME_CONSTANT
        float ageRot = u_ROLAngularVelocityConstSeparate.z * age;
        rotation += ageRot;
    #endif
    #ifdef ROTATION_OVER_LIFETIME_CURVE
        rotation += getTotalValueFromGradientFloat(u_ROLAngularVelocityGradientZ,
        normalizedAge);
    #endif
    #ifdef ROTATION_OVER_LIFETIME_RANDOM_CONSTANTS
        float ageRot = mix(u_ROLAngularVelocityConstSeparate.z,
                   u_ROLAngularVelocityConstMaxSeparate.z,
                   a_Random0.w)
        * age;
        rotation += ageRot;
    #endif
    #ifdef ROTATION_OVER_LIFETIME_RANDOM_CURVES
        rotation += mix(getTotalValueFromGradientFloat(u_ROLAngularVelocityGradientZ,
                normalizedAge),
        getTotalValueFromGradientFloat(
            u_ROLAngularVelocityGradientMaxZ, normalizedAge),
        a_Random0.w);
    #endif
#endif
    return rotation;
}

#if defined(RENDERER_MODE_MESH) && (defined(ROTATION_OVER_LIFETIME) || defined(ROTATION_OVER_LIFETIME_SEPARATE))
vec3 computeParticleRotationVec3(in vec3 rotation,
    in float age,
    in float normalizedAge) {
#ifdef ROTATION_OVER_LIFETIME
    #ifdef ROTATION_OVER_LIFETIME_CONSTANT
        float ageRot = u_ROLAngularVelocityConst * age;
        rotation += ageRot;
    #endif
    #ifdef ROTATION_OVER_LIFETIME_CURVE
        rotation += getTotalValueFromGradientFloat(u_ROLAngularVelocityGradient, normalizedAge);
    #endif
    #ifdef ROTATION_OVER_LIFETIME_RANDOM_CONSTANTS
        float ageRot = mix(u_ROLAngularVelocityConst, u_ROLAngularVelocityConstMax, a_Random0.w) * age;
        rotation += ageRot;
    #endif
    #ifdef ROTATION_OVER_LIFETIME_RANDOM_CURVES
        rotation += mix(
        getTotalValueFromGradientFloat(u_ROLAngularVelocityGradient, normalizedAge),
        getTotalValueFromGradientFloat(u_ROLAngularVelocityGradientMax,
            normalizedAge),
        a_Random0.w);
    #endif
#endif

#ifdef ROTATION_OVER_LIFETIME_SEPARATE
    #ifdef ROTATION_OVER_LIFETIME_CONSTANT
        vec3 ageRot = u_ROLAngularVelocityConstSeparate * age;
        rotation += ageRot;
    #endif
    #ifdef ROTATION_OVER_LIFETIME_CURVE
        rotation += vec3(getTotalValueFromGradientFloat(u_ROLAngularVelocityGradientX,
                 normalizedAge),
        getTotalValueFromGradientFloat(u_ROLAngularVelocityGradientY,
            normalizedAge),
        getTotalValueFromGradientFloat(u_ROLAngularVelocityGradientZ,
            normalizedAge));
    #endif
    #ifdef ROTATION_OVER_LIFETIME_RANDOM_CONSTANTS
        vec3 ageRot = mix(u_ROLAngularVelocityConstSeparate,
                  u_ROLAngularVelocityConstMaxSeparate,
                  a_Random0.w)
        * age;
        rotation += ageRot;
    #endif
    #ifdef ROTATION_OVER_LIFETIME_RANDOM_CURVES
        rotation += vec3(mix(getTotalValueFromGradientFloat(u_ROLAngularVelocityGradientX,
                     normalizedAge),
                 getTotalValueFromGradientFloat(u_ROLAngularVelocityGradientMaxX,
                     normalizedAge),
                 a_Random0.w),
        mix(getTotalValueFromGradientFloat(u_ROLAngularVelocityGradientY,
            normalizedAge),
            getTotalValueFromGradientFloat(u_ROLAngularVelocityGradientMaxY,
            normalizedAge),
            a_Random0.w),
        mix(getTotalValueFromGradientFloat(u_ROLAngularVelocityGradientZ,
            normalizedAge),
            getTotalValueFromGradientFloat(u_ROLAngularVelocityGradientMaxZ,
            normalizedAge),
            a_Random0.w));
    #endif
#endif
    return rotation;
}
#endif
