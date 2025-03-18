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

    vec3 computeParticleLifeForce(in float normalizedAge) {
        vec3 force;
        #ifdef RENDERER_FOL_CONSTANT_MODE
            force = renderer_FOLMaxConst;
            #ifdef RENDERER_FOL_IS_RANDOM_TWO
                force = mix(renderer_FOLMinConst, force, vec3(a_Random2.x, a_Random2.y, a_Random2.z));
            #endif
        #elif defined(RENDERER_FOL_CURVE_MODE)
            force = vec3(evaluateParticleCurve(renderer_FOLMaxGradientX, normalizedAge), evaluateParticleCurve(renderer_FOLMaxGradientY, normalizedAge), evaluateParticleCurve(renderer_FOLMaxGradientZ, normalizedAge));

            #ifdef RENDERER_FOL_IS_RANDOM_TWO
                force = vec3(
                    mix(force.x, evaluateParticleCurve(renderer_FOLMinGradientX, normalizedAge), a_Random2.x),
                    mix(force.y, evaluateParticleCurve(renderer_FOLMinGradientY, normalizedAge), a_Random2.y),
                    mix(force.z, evaluateParticleCurve(renderer_FOLMinGradientZ, normalizedAge), a_Random2.z)
                );
            #endif
        #endif
        return force;
    }
#endif