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

    float evaluateForceParticleCurveCumulative(in vec2 keys[4], in float normalizedAge) {
        float cumulativeValue = 0.0;
        float lastVelocity = 0.0;
        for (int i = 1; i < 4; i++){
            vec2 key = keys[i];
            float time = key.x;
            float currentValue = key.y;
            vec2 lastKey = keys[i - 1];
            float lastValue = lastKey.y;

            if (time >= normalizedAge){
                float lastTime = lastKey.x;
                float offsetTime = normalizedAge - lastTime;
                float age = offsetTime / (time - lastTime);
                float finalValue = mix(lastValue, currentValue, age);

                cumulativeValue += (lastValue + finalValue) * 0.5 * offsetTime * offsetTime + lastVelocity * offsetTime;
                break;
            }
            else{
                float offsetTime = time - lastKey.x;
                float incrementAverageVelocity = (lastValue + currentValue) * 0.5 * offsetTime;
                cumulativeValue += incrementAverageVelocity * offsetTime + lastVelocity * offsetTime;
                lastVelocity += incrementAverageVelocity;
            }
        }
        return cumulativeValue;
    }

    vec3 computeForcePositionOffset(in float normalizedAge, in float age) {
        vec3 forcePosition;

        #if defined(RENDERER_FOL_CONSTANT_MODE)
            vec3 forceAcceleration = renderer_FOLMaxConst;
            #ifdef RENDERER_FOL_IS_RANDOM_TWO
                forceAcceleration = mix(renderer_FOLMinConst, forceAcceleration, vec3(a_Random2.x, a_Random2.y, a_Random2.z));
            #endif

            forcePosition = 0.5 * forceAcceleration * age * age;
        #elif defined(RENDERER_FOL_CURVE_MODE)
            forcePosition = vec3(
                evaluateForceParticleCurveCumulative(renderer_FOLMaxGradientX, normalizedAge),
                evaluateForceParticleCurveCumulative(renderer_FOLMaxGradientY, normalizedAge),
                evaluateForceParticleCurveCumulative(renderer_FOLMaxGradientZ, normalizedAge)
            );
            #ifdef RENDERER_FOL_IS_RANDOM_TWO
                forcePosition = vec3(
                    mix(evaluateForceParticleCurveCumulative(renderer_FOLMinGradientX, normalizedAge), forcePosition.x, a_Random2.x),
                    mix(evaluateForceParticleCurveCumulative(renderer_FOLMinGradientY, normalizedAge), forcePosition.y, a_Random2.y),
                    mix(evaluateForceParticleCurveCumulative(renderer_FOLMinGradientZ, normalizedAge), forcePosition.z, a_Random2.z)
                );
            #endif
            forcePosition *= vec3(a_ShapePositionStartLifeTime.w * a_ShapePositionStartLifeTime.w);
        #endif
        return forcePosition;
    }
#endif