#if defined(RENDERER_VOL_CONSTANT) || defined(RENDERER_VOL_CURVE) || defined(RENDERER_VOL_RANDOM_CONSTANT) || defined(RENDERER_VOL_RANDOM_CURVE)
    uniform int renderer_VOLSpace;

    #if defined(RENDERER_VOL_CONSTANT) || defined(RENDERER_VOL_RANDOM_CONSTANT)
        uniform vec3 renderer_VOLMaxConst;

         #ifdef RENDERER_VOL_RANDOM_CONSTANT
            uniform vec3 renderer_VOLMinConst;
        #endif
    #endif

    #if defined(RENDERER_VOL_CURVE) || defined(RENDERER_VOL_RANDOM_CURVE)
        uniform vec2 renderer_VOLMaxGradientX[4]; // x:time y:value
        uniform vec2 renderer_VOLMaxGradientY[4]; // x:time y:value
        uniform vec2 renderer_VOLMaxGradientZ[4]; // x:time y:value

        #ifdef RENDERER_VOL_RANDOM_CURVE
            uniform vec2 renderer_VOLMinGradientX[4]; // x:time y:value
            uniform vec2 renderer_VOLMinGradientY[4]; // x:time y:value
            uniform vec2 renderer_VOLMinGradientZ[4]; // x:time y:value
        #endif
    #endif
#endif


#if defined(RENDERER_VOL_CONSTANT) || defined(RENDERER_VOL_CURVE) || defined(RENDERER_VOL_RANDOM_CONSTANT) || defined(RENDERER_VOL_RANDOM_CURVE)
    vec3 computeParticleLifeVelocity(in float normalizedAge) {
        vec3 velocity;
        #if defined(RENDERER_VOL_CONSTANT) || defined(RENDERER_VOL_RANDOM_CONSTANT)
            velocity = renderer_VOLMaxConst;
            #ifdef RENDERER_VOL_RANDOM_CONSTANT
                velocity = mix(renderer_VOLMinConst, velocity, vec3(a_Random1.y, a_Random1.z, a_Random1.w));
            #endif
        #endif
       
        #if defined(RENDERER_VOL_CURVE) || defined(RENDERER_VOL_RANDOM_CURVE)
            velocity = vec3(evaluateParticleCurve(renderer_VOLMaxGradientX, normalizedAge), evaluateParticleCurve(renderer_VOLMaxGradientY, normalizedAge), evaluateParticleCurve(renderer_VOLMaxGradientZ, normalizedAge));
        #endif
        
        #ifdef RENDERER_VOL_RANDOM_CURVE
            velocity = vec3(
            mix(velocity.x, evaluateParticleCurve(renderer_VOLMinGradientX, normalizedAge), a_Random1.y),
            mix(velocity.y, evaluateParticleCurve(renderer_VOLMinGradientY, normalizedAge), a_Random1.z),
            mix(velocity.z, evaluateParticleCurve(renderer_VOLMinGradientZ, normalizedAge), a_Random1.w));
        #endif

        return velocity;
    }
#endif

vec3 getStartPosition(vec3 startVelocity, float age, vec3 dragData) {
    vec3 startPosition;
    float lastTime = min(startVelocity.x / dragData.x, age); // todo 0/0
    startPosition = lastTime * (startVelocity - 0.5 * dragData * lastTime);
    return startPosition;
}

vec3 computeParticlePosition(in vec3 startVelocity, in vec3 lifeVelocity, in float age, in float normalizedAge, vec3 gravityVelocity, vec4 worldRotation, vec3 dragData) {
    vec3 startPosition = getStartPosition(startVelocity, age, dragData);
    vec3 lifePosition;
    #if defined(RENDERER_VOL_CONSTANT) || defined(RENDERER_VOL_CURVE) || defined(RENDERER_VOL_RANDOM_CONSTANT) || defined(RENDERER_VOL_RANDOM_CURVE)
        #if defined(RENDERER_VOL_CONSTANT)|| defined(RENDERER_VOL_RANDOM_CONSTANT)
            // @todo:just RENDERER_VOL_CONSTANT and RENDERER_VOL_RANDOM_CONSTANT need `lifeVelocity`
            lifePosition = lifeVelocity * age;
        #endif

        #if defined(RENDERER_VOL_CURVE) || defined(RENDERER_VOL_RANDOM_CURVE)
            lifePosition = vec3(
            evaluateParticleCurveCumulative(renderer_VOLMaxGradientX, normalizedAge)
            evaluateParticleCurveCumulative(renderer_VOLMaxGradientY, normalizedAge),
            evaluateParticleCurveCumulative(renderer_VOLMaxGradientZ, normalizedAge));

            #ifdef RENDERER_VOL_RANDOM_CURVE
                lifePosition = vec3(
                mix(evaluateParticleCurveCumulative(renderer_VOLMinGradientX, normalizedAge), lifePosition.x, a_Random1.y),
                mix(evaluateParticleCurveCumulative(renderer_VOLMinGradientY, normalizedAge), lifePosition.y, a_Random1.z),
                mix(evaluateParticleCurveCumulative(renderer_VOLMinGradientZ, normalizedAge), lifePosition.z, a_Random1.w));
            #endif

            lifePosition *= vec3(a_ShapePositionStartLifeTime.w);
        #endif
      
        vec3 finalPosition;
        if (renderer_VOLSpace == 0) {
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
