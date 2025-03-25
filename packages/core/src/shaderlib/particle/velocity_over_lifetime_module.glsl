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


    vec3 computeVelocityPositionOffset(in float normalizedAge, in float age) {
        vec3 velocityPosition;

        #ifdef RENDERER_FOL_CONSTANT_MODE
            vec3 lifeVelocity = renderer_VOLMaxConst;
            #ifdef RENDERER_VOL_IS_RANDOM_TWO
                lifeVelocity = mix(renderer_VOLMinConst, lifeVelocity, vec3(a_Random1.y, a_Random1.z, a_Random1.w));
            #endif

            velocityPosition = lifeVelocity * age;
        #endif

        #ifdef RENDERER_VOL_CURVE_MODE
            velocityPosition = vec3(
            evaluateParticleCurveCumulative(renderer_VOLMaxGradientX, normalizedAge),
            evaluateParticleCurveCumulative(renderer_VOLMaxGradientY, normalizedAge),
            evaluateParticleCurveCumulative(renderer_VOLMaxGradientZ, normalizedAge));

            #ifdef RENDERER_VOL_IS_RANDOM_TWO
                velocityPosition = vec3(
                mix(evaluateParticleCurveCumulative(renderer_VOLMinGradientX, normalizedAge), velocityPosition.x, a_Random1.y),
                mix(evaluateParticleCurveCumulative(renderer_VOLMinGradientY, normalizedAge), velocityPosition.y, a_Random1.z),
                mix(evaluateParticleCurveCumulative(renderer_VOLMinGradientZ, normalizedAge), velocityPosition.z, a_Random1.w));
            #endif

            velocityPosition *= vec3(a_ShapePositionStartLifeTime.w);
        #endif
        return velocityPosition;
    }
#endif
