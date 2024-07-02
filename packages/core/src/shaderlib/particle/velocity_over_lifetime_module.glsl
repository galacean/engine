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

vec3 getLimitLifePosition(in vec3 limitLifeVelocity, in float age, in float normalizedAge) {
    vec3 limitLifePosition;
    #if defined(RENDERER_LIMIT_VOL_CONSTANT) || defined(RENDERER_LIMIT_VOL_RANDOM_CONSTANT)
        limitLifePosition = limitLifeVelocity * age;
    #endif
    
    #if defined(RENDERER_LIMIT_VOL_CURVE) || defined(RENDERER_LIMIT_VOL_RANDOM_CURVE)
        limitLifePosition = vec3(
        evaluateParticleCurveCumulative(renderer_Limit_VOLMaxGradientX, normalizedAge), 
        evaluateParticleCurveCumulative(renderer_Limit_VOLMaxGradientY, normalizedAge), 
        evaluateParticleCurveCumulative(renderer_Limit_VOLMaxGradientZ, normalizedAge));
    
        #ifdef RENDERER_LIMIT_VOL_RANDOM_CURVE
            limitLifePosition = vec3(
        mix(limitLifePosition.x, evaluateParticleCurveCumulative(renderer_Limit_VOLMinGradientX, normalizedAge), a_Random2.x),
            mix(limitLifePosition.y, evaluateParticleCurveCumulative(renderer_Limit_VOLMinGradientY, normalizedAge), a_Random2.y),
            mix(limitLifePosition.z, evaluateParticleCurveCumulative(renderer_Limit_VOLMinGradientZ, normalizedAge), a_Random2.z));
        #endif

        limitLifePosition *= vec3(a_ShapePositionStartLifeTime.w);
    #endif

    return limitLifePosition;
}

vec3 getDampenedMix(in vec3 a, in vec3 b, float t){
    vec3 adjustedB = vec3(
        abs(a.x) < abs(b.x) ? a.x : sign(a.x) * abs(b.x),
        abs(a.y) < abs(b.y) ? a.y : sign(a.y) * abs(b.y),
        abs(a.z) < abs(b.z) ? a.z : sign(a.z) * abs(b.z)
    );
    vec3 interpolated = vec3(
        a.x + (adjustedB.x - a.x) * t,
        a.y + (adjustedB.y - a.y) * t,
        a.z + (adjustedB.z - a.z) * t
    );
    return normalize(a) * length(interpolated);
}

vec3 getDraggedPosition(vec3 velocity, float age, float drag){
    float speed = length(velocity);
    float lasttime = (abs(drag) > EPSILON) ? min(speed / drag,age ):age;
    return lasttime * (velocity - 0.5 * drag * lasttime);
}

vec3 computeParticlePosition(in vec3 startVelocity, in vec3 lifeVelocity, in vec3 limitLifeVelocity, in float age, in float normalizedAge, vec3 gravityVelocity, vec4 worldRotation, float drag, float dampen) {
    vec3 startPosition = getDraggedPosition(startVelocity, age, drag);
    vec3 lifePosition;
    vec3 limitLifePosition;
    vec3 draggedLifePosition;

    #if defined(RENDERER_LIMIT_VOL_CONSTANT) || defined(RENDERER_LIMIT_VOL_CURVE) || defined(RENDERER_LIMIT_VOL_RANDOM_CONSTANT) || defined(RENDERER_LIMIT_VOL_RANDOM_CURVE)
        limitLifePosition = getLimitLifePosition(limitLifeVelocity, age, normalizedAge);
    #endif

    #if defined(RENDERER_VOL_CONSTANT) || defined(RENDERER_VOL_CURVE) || defined(RENDERER_VOL_RANDOM_CONSTANT) || defined(RENDERER_VOL_RANDOM_CURVE)
        #if defined(RENDERER_VOL_CURVE) || defined(RENDERER_VOL_RANDOM_CURVE)
            lifePosition = vec3(
            evaluateParticleCurveCumulative(renderer_VOLMaxGradientX, normalizedAge),
            evaluateParticleCurveCumulative(renderer_VOLMaxGradientY, normalizedAge),
            evaluateParticleCurveCumulative(renderer_VOLMaxGradientZ, normalizedAge));

            #ifdef RENDERER_VOL_RANDOM_CURVE
                lifePosition = vec3(
                mix(evaluateParticleCurveCumulative(renderer_VOLMinGradientX, normalizedAge), lifePosition.x, a_Random1.y),
                mix(evaluateParticleCurveCumulative(renderer_VOLMinGradientY, normalizedAge), lifePosition.y, a_Random1.z),
                mix(evaluateParticleCurveCumulative(renderer_VOLMinGradientZ, normalizedAge), lifePosition.z, a_Random1.w));
            #endif

            lifePosition *= vec3(a_ShapePositionStartLifeTime.w);
            lifeVelocity = lifePosition / age;
        #endif
        draggedLifePosition = getDraggedPosition(lifeVelocity, age, drag);
      
        vec3 finalPosition;
        if (renderer_VOLSpace == 0) {       
            finalPosition = rotationByQuaternions(a_ShapePositionStartLifeTime.xyz + getDampenedMix(startPosition + draggedLifePosition,limitLifePosition,dampen), worldRotation);
        } else {  
            vec3 averageVelocity = (rotationByQuaternions(startPosition, worldRotation) + draggedLifePosition) / age;
            vec3 averageLimitLifeVelocity = limitLifePosition / age;

            finalPosition = rotationByQuaternions(a_ShapePositionStartLifeTime.xyz, worldRotation) + getDampenedMix(averageVelocity,averageLimitLifeVelocity,dampen) * age;
        }
    #else
        vec3 finalPosition = rotationByQuaternions(a_ShapePositionStartLifeTime.xyz + getDampenedMix(startPosition, limitLifePosition, dampen), worldRotation);
    #endif

    if (renderer_SimulationSpace == 0) {
        finalPosition = finalPosition + renderer_WorldPosition;
    } else if (renderer_SimulationSpace == 1) {
	    finalPosition = finalPosition + a_SimulationWorldPosition;
	}

    finalPosition += 0.5 * gravityVelocity * age;

    return finalPosition;
}
