#if defined(RENDERER_FOL_CONSTANT) || defined(RENDERER_FOL_CURVE) || defined(RENDERER_FOL_RANDOM_CONSTANT) || defined(RENDERER_FOL_RANDOM_CURVE)
    #define _PARTICLE_FOL_MODULE_ENABLED
#endif

#ifdef _PARTICLE_FOL_MODULE_ENABLED
    uniform int renderer_FOLSpace;

    #if defined(RENDERER_FOL_CONSTANT) || defined(RENDERER_FOL_RANDOM_CONSTANT)
        uniform vec3 renderer_FOLMaxConst;

        #ifdef RENDERER_FOL_RANDOM_CONSTANT
            uniform vec3 renderer_FOLMinConst;
        #endif

    #endif

    #if defined(RENDERER_FOL_CURVE) || defined(RENDERER_FOL_RANDOM_CURVE)
        uniform vec2 renderer_FOLMaxGradientX[4];
        uniform vec2 renderer_FOLMaxGradientY[4];
        uniform vec2 renderer_FOLMaxGradientZ[4];

        #ifdef RENDERER_FOL_RANDOM_CURVE
            uniform vec2 renderer_FOLMinGradientX[4];
            uniform vec2 renderer_FOLMinGradientY[4];
            uniform vec2 renderer_FOLMinGradientZ[4];
        #endif
    #endif

    vec3 computeParticleLifeForce(in float normalizedAge) {
        vec3 force;
        #if defined(RENDERER_FOL_CONSTANT) || defined(RENDERER_FOL_RANDOM_CONSTANT)
            force = renderer_FOLMaxConst;
            #ifdef RENDERER_FOL_RANDOM_CONSTANT
                force = mix(renderer_FOLMinConst, force, vec3(a_Random1.y, a_Random1.z, a_Random1.w));
            #endif
        #elif defined(RENDERER_FOL_CURVE) || defined(RENDERER_FOL_RANDOM_CURVE)
            force = vec3(evaluateParticleCurve(renderer_FOLMaxGradientX, normalizedAge), evaluateParticleCurve(renderer_FOLMaxGradientY, normalizedAge), evaluateParticleCurve(renderer_FOLMaxGradientZ, normalizedAge));

            #ifdef RENDERER_FOL_RANDOM_CURVE
                force = vec3(
                    mix(force.x, evaluateParticleCurve(renderer_FOLMinGradientX, normalizedAge), a_Random1.y),
                    mix(force.y, evaluateParticleCurve(renderer_FOLMinGradientY, normalizedAge), a_Random1.z),
                    mix(force.z, evaluateParticleCurve(renderer_FOLMinGradientZ, normalizedAge), a_Random1.w)
                );
            #endif
        #endif
        return force;
    }
#endif