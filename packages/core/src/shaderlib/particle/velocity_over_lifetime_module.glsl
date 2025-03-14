#include <force_over_lifetime_module>

#if defined(RENDERER_VOL_CONSTANT) || defined(RENDERER_VOL_CURVE) || defined(RENDERER_VOL_RANDOM_CONSTANT) || defined(RENDERER_VOL_RANDOM_CURVE)
    #define _PARTICLE_VOL_MODULE_ENABLED
#endif

#ifdef _PARTICLE_VOL_MODULE_ENABLED
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


#ifdef _PARTICLE_VOL_MODULE_ENABLED
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

    vec3 finalPosition;
    vec3 localPositionOffset = startPosition;
    vec3 worldPositionOffset;

    #ifdef _PARTICLE_VOL_MODULE_ENABLED
        vec3 lifeVelocityPosition;
        #if defined(RENDERER_VOL_CONSTANT)|| defined(RENDERER_VOL_RANDOM_CONSTANT)
            // @todo:just RENDERER_VOL_CONSTANT and RENDERER_VOL_RANDOM_CONSTANT need `lifeVelocity`
            lifeVelocityPosition = lifeVelocity * age;
        #endif

        #if defined(RENDERER_VOL_CURVE) || defined(RENDERER_VOL_RANDOM_CURVE)
            lifeVelocityPosition = vec3(
            evaluateParticleCurveCumulative(renderer_VOLMaxGradientX, normalizedAge),
            evaluateParticleCurveCumulative(renderer_VOLMaxGradientY, normalizedAge),
            evaluateParticleCurveCumulative(renderer_VOLMaxGradientZ, normalizedAge));

            #ifdef RENDERER_VOL_RANDOM_CURVE
                lifeVelocityPosition = vec3(
                mix(evaluateParticleCurveCumulative(renderer_VOLMinGradientX, normalizedAge), lifeVelocityPosition.x, a_Random1.y),
                mix(evaluateParticleCurveCumulative(renderer_VOLMinGradientY, normalizedAge), lifeVelocityPosition.y, a_Random1.z),
                mix(evaluateParticleCurveCumulative(renderer_VOLMinGradientZ, normalizedAge), lifeVelocityPosition.z, a_Random1.w));
            #endif

            lifeVelocityPosition *= vec3(a_ShapePositionStartLifeTime.w);
        #endif
      
        if (renderer_VOLSpace == 0) {
            localPositionOffset += lifeVelocityPosition;
        } else {
            worldPositionOffset += lifeVelocityPosition;
        }
    #endif

    #ifdef _PARTICLE_FOL_MODULE_ENABLED
        vec3 forcePosition;

        #if defined(RENDERER_FOL_CONSTANT) || defined(RENDERER_FOL_RANDOM_CONSTANT)
            vec3 forceAcceleration = computeParticleLifeForce(normalizedAge);
            forcePosition = 0.5 * forceAcceleration * age * age;
        #elif defined(RENDERER_FOL_CURVE) || defined(RENDERER_FOL_RANDOM_CURVE)
            forcePosition = vec3(
                evaluateParticleCurveSquareCumulative(renderer_FOLMaxGradientX, normalizedAge),
                evaluateParticleCurveSquareCumulative(renderer_FOLMaxGradientY, normalizedAge),
                evaluateParticleCurveSquareCumulative(renderer_FOLMaxGradientZ, normalizedAge)
            );
            #ifdef RENDERER_FOL_RANDOM_CURVE
                forcePosition = vec3(
                    mix(evaluateParticleCurveSquareCumulative(renderer_FOLMinGradientX, normalizedAge), forcePosition.x, a_Random1.y),
                    mix(evaluateParticleCurveSquareCumulative(renderer_FOLMinGradientY, normalizedAge), forcePosition.y, a_Random1.z),
                    mix(evaluateParticleCurveSquareCumulative(renderer_FOLMinGradientZ, normalizedAge), forcePosition.z, a_Random1.w)
                );
            #endif
            forcePosition *= vec3(a_ShapePositionStartLifeTime.w * a_ShapePositionStartLifeTime.w);
        #endif

        if (renderer_FOLSpace == 0) {
            localPositionOffset += forcePosition;
        } else {
            worldPositionOffset += forcePosition;
        }
    #endif

    finalPosition = rotationByQuaternions(a_ShapePositionStartLifeTime.xyz + localPositionOffset, worldRotation) + worldPositionOffset;

    if (renderer_SimulationSpace == 0) {
        finalPosition = finalPosition + renderer_WorldPosition;
    } else if (renderer_SimulationSpace == 1) {
	    finalPosition = finalPosition + a_SimulationWorldPosition;
	}

    finalPosition += 0.5 * gravityVelocity * age;

    return finalPosition;
}
