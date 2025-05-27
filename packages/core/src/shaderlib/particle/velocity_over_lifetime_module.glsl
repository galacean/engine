#if defined(RENDERER_VOL_CONSTANT_MODE) || defined(RENDERER_VOL_CURVE_MODE)
    #define _VOL_MODULE_ENABLED
#endif

#ifdef _VOL_MODULE_ENABLED
    uniform int renderer_VOLSpace;

    #ifdef RENDERER_VOL_CONSTANT_MODE
        uniform vec3 renderer_VOLMaxConst;

         #ifdef RENDERER_VOL_IS_RANDOM_TWO
            uniform vec3 renderer_VOLMinConst;
        #endif
    #endif

    #ifdef RENDERER_VOL_CURVE_MODE
        uniform vec2 renderer_VOLMaxGradientX[4]; // x:time y:value
        uniform vec2 renderer_VOLMaxGradientY[4]; // x:time y:value
        uniform vec2 renderer_VOLMaxGradientZ[4]; // x:time y:value

        #ifdef RENDERER_VOL_IS_RANDOM_TWO
            uniform vec2 renderer_VOLMinGradientX[4]; // x:time y:value
            uniform vec2 renderer_VOLMinGradientY[4]; // x:time y:value
            uniform vec2 renderer_VOLMinGradientZ[4]; // x:time y:value
        #endif
    #endif


    vec3 computeVelocityPositionOffset(in float normalizedAge, in float age, out vec3 currentVelocity) {
        vec3 velocityPosition;

        #ifdef RENDERER_VOL_CONSTANT_MODE
            currentVelocity = renderer_VOLMaxConst;
            #ifdef RENDERER_VOL_IS_RANDOM_TWO
                currentVelocity = mix(renderer_VOLMinConst, currentVelocity, a_Random1.yzw);
            #endif

            velocityPosition = currentVelocity * age;
        #endif

        #ifdef RENDERER_VOL_CURVE_MODE
            velocityPosition = vec3(
            evaluateParticleCurveCumulative(renderer_VOLMaxGradientX, normalizedAge, currentVelocity.x),
            evaluateParticleCurveCumulative(renderer_VOLMaxGradientY, normalizedAge, currentVelocity.y),
            evaluateParticleCurveCumulative(renderer_VOLMaxGradientZ, normalizedAge, currentVelocity.z));

            #ifdef RENDERER_VOL_IS_RANDOM_TWO
                vec3 minCurrentVelocity;
                vec3 minVelocityPosition = vec3(
                    evaluateParticleCurveCumulative(renderer_VOLMinGradientX, normalizedAge, minCurrentVelocity.x),
                    evaluateParticleCurveCumulative(renderer_VOLMinGradientY, normalizedAge, minCurrentVelocity.y),
                    evaluateParticleCurveCumulative(renderer_VOLMinGradientZ, normalizedAge, minCurrentVelocity.z));

                currentVelocity = mix(minCurrentVelocity, currentVelocity, a_Random1.yzw);
                velocityPosition = mix(minVelocityPosition, velocityPosition, a_Random1.yzw);
            #endif

            velocityPosition *= vec3(a_ShapePositionStartLifeTime.w);
        #endif
        return velocityPosition;
    }
#endif
