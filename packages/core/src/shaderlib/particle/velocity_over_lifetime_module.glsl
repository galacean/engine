#if defined(RENDERER_VOL_CONSTANT) || defined(RENDERER_VOL_CURVE) || defined(RENDERER_VOL_RANDOM_CONSTANT) || defined(RENDERER_VOL_RANDOM_CURVE)
    uniform int renderer_VOLSpaceType;
#endif

#if defined(RENDERER_VOL_CONSTANT) || defined(RENDERER_VOL_RANDOM_CONSTANT)
    uniform vec3 u_VOLVelocityConst;
#endif
#if defined(RENDERER_VOL_CURVE) || defined(RENDERER_VOL_RANDOM_CURVE)
    uniform vec2 u_VOLVelocityGradientX[4]; // x为key,y为速度
    uniform vec2 u_VOLVelocityGradientY[4]; // x为key,y为速度
    uniform vec2 u_VOLVelocityGradientZ[4]; // x为key,y为速度
#endif
#ifdef RENDERER_VOL_RANDOM_CONSTANT
    uniform vec3 u_VOLVelocityConstMax;
#endif
#ifdef RENDERER_VOL_RANDOM_CURVE
    uniform vec2 u_VOLVelocityGradientMaxX[4]; // x为key,y为速度
    uniform vec2 u_VOLVelocityGradientMaxY[4]; // x为key,y为速度
    uniform vec2 u_VOLVelocityGradientMaxZ[4]; // x为key,y为速度
#endif

#if defined(RENDERER_VOL_CONSTANT) || defined(RENDERER_VOL_CURVE) || defined(RENDERER_VOL_RANDOM_CONSTANT) || defined(RENDERER_VOL_RANDOM_CURVE)
vec3 computeParticleLifeVelocity(in float normalizedAge) {
    vec3 outLifeVelocity;
    #ifdef RENDERER_VOL_CONSTANT
        outLifeVelocity = u_VOLVelocityConst;
    #endif
    #ifdef RENDERER_VOL_CURVE
        outLifeVelocity = vec3(evaluateParticleCurve(u_VOLVelocityGradientX, normalizedAge),
        evaluateParticleCurve(u_VOLVelocityGradientY, normalizedAge),
        evaluateParticleCurve(u_VOLVelocityGradientZ, normalizedAge));
    #endif
    #ifdef RENDERER_VOL_RANDOM_CONSTANT
        outLifeVelocity = mix(u_VOLVelocityConst,
        u_VOLVelocityConstMax,
        vec3(a_Random1.y, a_Random1.z, a_Random1.w));
    #endif
    #ifdef RENDERER_VOL_RANDOM_CURVE
        outLifeVelocity = vec3(
        mix(evaluateParticleCurve(u_VOLVelocityGradientX, normalizedAge),
            evaluateParticleCurve(u_VOLVelocityGradientMaxX, normalizedAge),
            a_Random1.y),
        mix(evaluateParticleCurve(u_VOLVelocityGradientY, normalizedAge),
            evaluateParticleCurve(u_VOLVelocityGradientMaxY, normalizedAge),
            a_Random1.z),
        mix(evaluateParticleCurve(u_VOLVelocityGradientZ, normalizedAge),
            evaluateParticleCurve(u_VOLVelocityGradientMaxZ, normalizedAge),
            a_Random1.w));
    #endif

    return outLifeVelocity;
}
#endif

vec3 getStartPosition(vec3 startVelocity, float age, vec3 dragData) {
    vec3 startPosition;
    float lastTime = min(startVelocity.x / dragData.x, age); // todo 0/0
    startPosition = lastTime * (startVelocity - 0.5 * dragData * lastTime);
    return startPosition;
}

vec3 computeParticlePosition(in vec3 startVelocity, in vec3 lifeVelocity, in float age, in float normalizedAge,
                             vec3 gravityVelocity, vec4 worldRotation, vec3 dragData) {
    vec3 startPosition = getStartPosition(startVelocity, age, dragData);
    vec3 lifePosition;
#if defined(RENDERER_VOL_CONSTANT) || defined(RENDERER_VOL_CURVE) || defined(RENDERER_VOL_RANDOM_CONSTANT) || defined(RENDERER_VOL_RANDOM_CURVE)
    #ifdef RENDERER_VOL_CONSTANT
        lifePosition = lifeVelocity * age;
    #endif

    #ifdef RENDERER_VOL_CURVE
        lifePosition = vec3(getTotalValueFromGradientFloat(u_VOLVelocityGradientX, normalizedAge),
        getTotalValueFromGradientFloat(u_VOLVelocityGradientY, normalizedAge),
        getTotalValueFromGradientFloat(u_VOLVelocityGradientZ, normalizedAge));
    #endif

    #ifdef RENDERER_VOL_RANDOM_CONSTANT
        lifePosition = lifeVelocity * age;
    #endif

    #ifdef RENDERER_VOL_RANDOM_CURVE
        lifePosition = vec3(
        mix(getTotalValueFromGradientFloat(u_VOLVelocityGradientX, normalizedAge),
            getTotalValueFromGradientFloat(u_VOLVelocityGradientMaxX, normalizedAge),
            a_Random1.y),
        mix(getTotalValueFromGradientFloat(u_VOLVelocityGradientY, normalizedAge),
            getTotalValueFromGradientFloat(u_VOLVelocityGradientMaxY, normalizedAge),
            a_Random1.z),
        mix(getTotalValueFromGradientFloat(u_VOLVelocityGradientZ, normalizedAge),
            getTotalValueFromGradientFloat(u_VOLVelocityGradientMaxZ, normalizedAge),
            a_Random1.w));
    #endif

    vec3 finalPosition;
    if (renderer_VOLSpaceType == 0) {
        finalPosition = rotationByQuaternions(a_ShapePositionStartLifeTime.xyz + startPosition + lifePosition, worldRotation);
    } else {
        finalPosition = rotationByQuaternions(a_ShapePositionStartLifeTime.xyz + startPosition, worldRotation) + lifePosition;
    }
#else
    vec3 finalPosition = rotationByQuaternions(a_ShapePositionStartLifeTime.xyz + startPosition, worldRotation);
#endif

    if (u_SimulationSpace == 0) {
        finalPosition = finalPosition + u_WorldPosition;
    } else if (u_SimulationSpace == 1) {
	    finalPosition = finalPosition + a_SimulationWorldPosition;
	}

    finalPosition += 0.5 * gravityVelocity * age;

    return finalPosition;
}
