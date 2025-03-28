#if defined(RENDERER_FOL_CONSTANT_MODE) || defined(RENDERER_FOL_CURVE_MODE)
    #define _FOL_MODULE_ENABLED
#endif

#ifdef _FOL_MODULE_ENABLED
    attribute vec4 a_Random2;

    uniform int renderer_FOLSpace;

    #ifdef RENDERER_FOL_CONSTANT_MODE
        uniform vec3 renderer_FOLMaxConst;

        #ifdef RENDERER_FOL_IS_RANDOM_TWO
            uniform vec3 renderer_FOLMinConst;
        #endif

    #endif

    #ifdef RENDERER_FOL_CURVE_MODE
        uniform vec2 renderer_FOLMaxGradientX[4];
        uniform vec2 renderer_FOLMaxGradientY[4];
        uniform vec2 renderer_FOLMaxGradientZ[4];

        #ifdef RENDERER_FOL_IS_RANDOM_TWO
            uniform vec2 renderer_FOLMinGradientX[4];
            uniform vec2 renderer_FOLMinGradientY[4];
            uniform vec2 renderer_FOLMinGradientZ[4];
        #endif
    #endif

    // (tHat - t1) * (tHat - t1) * (tHat - t1) * (a2 - a1) / ((t2 - t1) * 6.0) + a1 * (tHat - t1) * (tHat - t1) * 0.5 + v1 * (tHat - t1);
    float computeDisplacementIntegral(in float tHat, in float t1, in float t2, in float a1, in float a2, in float v1) {
        float tHatSubT1 = tHat - t1;
        return tHatSubT1 * tHatSubT1 * tHatSubT1 * (a2 - a1) / ((t2 - t1) * 6.0) + a1 * tHatSubT1 * tHatSubT1 * 0.5 + v1 * tHatSubT1;
    }

    float evaluateForceParticleCurveCumulative(in vec2 keys[4], in float normalizedAge, out float velocityOffsetComponent) {
        float cumulativeValue = 0.0;
        velocityOffsetComponent = 0.0;

        for (int i = 1; i < 4; i++){
            vec2 key = keys[i];
            vec2 lastKey = keys[i - 1];
            float t1 = lastKey.x * a_ShapePositionStartLifeTime.w;
            float t2 = key.x * a_ShapePositionStartLifeTime.w;

            if (key.x >= normalizedAge){
                float tHat = normalizedAge * a_ShapePositionStartLifeTime.w;
                cumulativeValue += computeDisplacementIntegral(tHat, t1, t2, lastKey.y, key.y, velocityOffsetComponent);

                float timeOffset = normalizedAge - lastKey.x;
                float ratio = timeOffset / (key.x - lastKey.x);
                float finalAcceleration = mix(lastKey.y, key.y, ratio);
                velocityOffsetComponent += 0.5 * timeOffset * (finalAcceleration + lastKey.y);
                break;
            } else {  
                cumulativeValue += computeDisplacementIntegral(t2, t1, t2, lastKey.y, key.y, velocityOffsetComponent);
                velocityOffsetComponent += 0.5 * (t2 - t1) * (lastKey.y + key.y);
            }
        }
        return cumulativeValue;
    }

    vec3 computeForcePositionOffset(in float normalizedAge, in float age, out vec3 velocityOffset) {
        vec3 forcePosition;

        #if defined(RENDERER_FOL_CONSTANT_MODE)
            vec3 forceAcceleration = renderer_FOLMaxConst;

            #ifdef RENDERER_FOL_IS_RANDOM_TWO
                forceAcceleration = mix(renderer_FOLMinConst, forceAcceleration, vec3(a_Random2.x, a_Random2.y, a_Random2.z));
            #endif

            velocityOffset = forceAcceleration * age;

            forcePosition = 0.5 * forceAcceleration * age * age;
        #elif defined(RENDERER_FOL_CURVE_MODE)
            forcePosition = vec3(
                evaluateForceParticleCurveCumulative(renderer_FOLMaxGradientX, normalizedAge, velocityOffset.x),
                evaluateForceParticleCurveCumulative(renderer_FOLMaxGradientY, normalizedAge, velocityOffset.y),
                evaluateForceParticleCurveCumulative(renderer_FOLMaxGradientZ, normalizedAge, velocityOffset.z)
            );
            #ifdef RENDERER_FOL_IS_RANDOM_TWO
                vec3 minVelocityOffset;

                forcePosition = vec3(
                    mix(evaluateForceParticleCurveCumulative(renderer_FOLMinGradientX, normalizedAge, minVelocityOffset.x), forcePosition.x, a_Random2.x),
                    mix(evaluateForceParticleCurveCumulative(renderer_FOLMinGradientY, normalizedAge, minVelocityOffset.y), forcePosition.y, a_Random2.y),
                    mix(evaluateForceParticleCurveCumulative(renderer_FOLMinGradientZ, normalizedAge, minVelocityOffset.z), forcePosition.z, a_Random2.z)
                );

                velocityOffset = mix(minVelocityOffset, velocityOffset, vec3(a_Random2.x, a_Random2.y, a_Random2.z));
            #endif
        #endif
        return forcePosition;
    }
#endif