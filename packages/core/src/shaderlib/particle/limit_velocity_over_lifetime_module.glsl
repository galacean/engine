#if defined(RENDERER_LIMIT_VOL_CONSTANT) || defined(RENDERER_LIMIT_VOL_CURVE) || defined(RENDERER_LIMIT_VOL_RANDOM_CONSTANT) || defined(RENDERER_LIMIT_VOL_RANDOM_CURVE)

    #if defined(RENDERER_LIMIT_VOL_CONSTANT) || defined(RENDERER_LIMIT_VOL_RANDOM_CONSTANT)
        uniform vec3 renderer_Limit_VOLMaxConst;

         #ifdef RENDERER_LIMIT_VOL_RANDOM_CONSTANT
            uniform vec3 renderer_Limit_VOLMinConst;
        #endif
    #endif

    #if defined(RENDERER_LIMIT_VOL_CURVE) || defined(RENDERER_LIMIT_VOL_RANDOM_CURVE)
        uniform vec2 renderer_Limit_VOLMaxGradientX[4]; // x:time y:value
        uniform vec2 renderer_Limit_VOLMaxGradientY[4]; // x:time y:value
        uniform vec2 renderer_Limit_VOLMaxGradientZ[4]; // x:time y:value

        #ifdef RENDERER_LIMIT_VOL_RANDOM_CURVE
            uniform vec2 renderer_Limit_VOLMinGradientX[4]; // x:time y:value
            uniform vec2 renderer_Limit_VOLMinGradientY[4]; // x:time y:value
            uniform vec2 renderer_Limit_VOLMinGradientZ[4]; // x:time y:value
        #endif
    #endif
#endif

#if defined(RENDERER_LIMIT_VOL_CONSTANT) || defined(RENDERER_LIMIT_VOL_CURVE) || defined(RENDERER_LIMIT_VOL_RANDOM_CONSTANT) || defined(RENDERER_LIMIT_VOL_RANDOM_CURVE)
    vec3 computeParticleLimitLifeVelocity(in float normalizedAge) {
        vec3 velocity;
        #if defined(RENDERER_LIMIT_VOL_CONSTANT) || defined(RENDERER_LIMIT_VOL_RANDOM_CONSTANT)
            velocity = renderer_Limit_VOLMaxConst;
            #ifdef RENDERER_LIMIT_VOL_RANDOM_CONSTANT
                velocity = mix(renderer_Limit_VOLMinConst, velocity, vec3(a_Random2.x, a_Random2.y, a_Random2.z));
            #endif
        #endif
       
        #if defined(RENDERER_LIMIT_VOL_CURVE) || defined(RENDERER_LIMIT_VOL_RANDOM_CURVE)
            velocity = vec3(evaluateParticleCurve(renderer_Limit_VOLMaxGradientX, normalizedAge), evaluateParticleCurve(renderer_Limit_VOLMaxGradientY, normalizedAge), evaluateParticleCurve(renderer_Limit_VOLMaxGradientZ, normalizedAge));
        #endif
        
        #ifdef RENDERER_LIMIT_VOL_RANDOM_CURVE
            velocity = vec3(
            mix(velocity.x, evaluateParticleCurve(renderer_Limit_VOLMinGradientX, normalizedAge), a_Random2.x),
            mix(velocity.y, evaluateParticleCurve(renderer_Limit_VOLMinGradientY, normalizedAge), a_Random2.y),
            mix(velocity.z, evaluateParticleCurve(renderer_Limit_VOLMinGradientZ, normalizedAge), a_Random2.z));
        #endif

        return velocity;
    }
#endif 
