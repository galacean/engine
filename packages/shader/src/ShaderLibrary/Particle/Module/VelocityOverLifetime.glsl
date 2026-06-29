#ifndef VELOCITY_OVER_LIFETIME_INCLUDED
#define VELOCITY_OVER_LIFETIME_INCLUDED

#if defined(RENDERER_VOL_CONSTANT_MODE) || defined(RENDERER_VOL_CURVE_MODE)
    #define _VOL_LINEAR_MODULE_ENABLED
#endif

#if defined(_VOL_LINEAR_MODULE_ENABLED) || defined(RENDERER_VOL_ORBITAL_CONSTANT_MODE) || defined(RENDERER_VOL_ORBITAL_CURVE_MODE) || defined(RENDERER_VOL_RADIAL_CONSTANT_MODE) || defined(RENDERER_VOL_RADIAL_CURVE_MODE)
    #define _VOL_MODULE_ENABLED
#endif

#ifdef _VOL_MODULE_ENABLED
    #ifdef _VOL_LINEAR_MODULE_ENABLED
    int renderer_VOLSpace;

    #ifdef RENDERER_VOL_CONSTANT_MODE
        vec3 renderer_VOLMaxConst;

         #ifdef RENDERER_VOL_IS_RANDOM_TWO
            vec3 renderer_VOLMinConst;
        #endif
    #endif

    #ifdef RENDERER_VOL_CURVE_MODE
        vec2 renderer_VOLMaxGradientX[4]; // x:time y:value
        vec2 renderer_VOLMaxGradientY[4]; // x:time y:value
        vec2 renderer_VOLMaxGradientZ[4]; // x:time y:value

        #ifdef RENDERER_VOL_IS_RANDOM_TWO
            vec2 renderer_VOLMinGradientX[4]; // x:time y:value
            vec2 renderer_VOLMinGradientY[4]; // x:time y:value
            vec2 renderer_VOLMinGradientZ[4]; // x:time y:value
        #endif
    #endif

    vec3 computeVelocityPositionOffset(Attributes attributes, in float normalizedAge, in float age, out vec3 currentVelocity) {
        vec3 velocityPosition;

        #ifdef RENDERER_VOL_CONSTANT_MODE
            currentVelocity = renderer_VOLMaxConst;
            #ifdef RENDERER_VOL_IS_RANDOM_TWO
                currentVelocity = mix(renderer_VOLMinConst, currentVelocity, attributes.a_Random1.yzw);
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

                currentVelocity = mix(minCurrentVelocity, currentVelocity, attributes.a_Random1.yzw);
                velocityPosition = mix(minVelocityPosition, velocityPosition, attributes.a_Random1.yzw);
            #endif

            velocityPosition *= vec3(attributes.a_ShapePositionStartLifeTime.w);
        #endif
        return velocityPosition;
    }

    #endif

    // Orbital / Radial (transform-feedback only). Center of orbit in system-local space.
    #if defined(RENDERER_VOL_ORBITAL_CONSTANT_MODE) || defined(RENDERER_VOL_ORBITAL_CURVE_MODE) || defined(RENDERER_VOL_RADIAL_CONSTANT_MODE) || defined(RENDERER_VOL_RADIAL_CURVE_MODE)
        vec3 renderer_VOLOffset;
    #endif

    #ifdef RENDERER_VOL_ORBITAL_CONSTANT_MODE
        vec3 renderer_VOLOrbitalMaxConst; // radians/second around x,y,z
        #ifdef RENDERER_VOL_ORBITAL_IS_RANDOM_TWO
            vec3 renderer_VOLOrbitalMinConst;
        #endif
    #endif
    #ifdef RENDERER_VOL_ORBITAL_CURVE_MODE
        vec2 renderer_VOLOrbitalMaxCurveX[4]; // x:time y:value
        vec2 renderer_VOLOrbitalMaxCurveY[4];
        vec2 renderer_VOLOrbitalMaxCurveZ[4];
        #ifdef RENDERER_VOL_ORBITAL_IS_RANDOM_TWO
            vec2 renderer_VOLOrbitalMinCurveX[4];
            vec2 renderer_VOLOrbitalMinCurveY[4];
            vec2 renderer_VOLOrbitalMinCurveZ[4];
        #endif
    #endif
    #ifdef RENDERER_VOL_RADIAL_CONSTANT_MODE
        float renderer_VOLRadialMaxConst;
        #ifdef RENDERER_VOL_RADIAL_IS_RANDOM_TWO
            float renderer_VOLRadialMinConst;
        #endif
    #endif
    #ifdef RENDERER_VOL_RADIAL_CURVE_MODE
        vec2 renderer_VOLRadialMaxCurve[4]; // x:time y:value
        #ifdef RENDERER_VOL_RADIAL_IS_RANDOM_TWO
            vec2 renderer_VOLRadialMinCurve[4];
        #endif
    #endif

    #if defined(RENDERER_VOL_ORBITAL_CONSTANT_MODE) || defined(RENDERER_VOL_ORBITAL_CURVE_MODE)
        vec3 evaluateVOLOrbital(Attributes attributes, float normalizedAge) {
            #ifdef RENDERER_VOL_ORBITAL_CONSTANT_MODE
                vec3 orbital = renderer_VOLOrbitalMaxConst;
                #ifdef RENDERER_VOL_ORBITAL_IS_RANDOM_TWO
                    orbital = mix(renderer_VOLOrbitalMinConst, orbital, attributes.a_Random1.yzw);
                #endif
                return orbital;
            #else
                vec3 orbital = vec3(
                    evaluateParticleCurve(renderer_VOLOrbitalMaxCurveX, normalizedAge),
                    evaluateParticleCurve(renderer_VOLOrbitalMaxCurveY, normalizedAge),
                    evaluateParticleCurve(renderer_VOLOrbitalMaxCurveZ, normalizedAge));
                #ifdef RENDERER_VOL_ORBITAL_IS_RANDOM_TWO
                    vec3 minOrbital = vec3(
                        evaluateParticleCurve(renderer_VOLOrbitalMinCurveX, normalizedAge),
                        evaluateParticleCurve(renderer_VOLOrbitalMinCurveY, normalizedAge),
                        evaluateParticleCurve(renderer_VOLOrbitalMinCurveZ, normalizedAge));
                    orbital = mix(minOrbital, orbital, attributes.a_Random1.yzw);
                #endif
                return orbital;
            #endif
        }
    #endif

    #if defined(RENDERER_VOL_RADIAL_CONSTANT_MODE) || defined(RENDERER_VOL_RADIAL_CURVE_MODE)
        float evaluateVOLRadial(Attributes attributes, float normalizedAge) {
            #ifdef RENDERER_VOL_RADIAL_CONSTANT_MODE
                float radial = renderer_VOLRadialMaxConst;
                #ifdef RENDERER_VOL_RADIAL_IS_RANDOM_TWO
                    radial = mix(renderer_VOLRadialMinConst, radial, attributes.a_Random1.y);
                #endif
                return radial;
            #else
                float radial = evaluateParticleCurve(renderer_VOLRadialMaxCurve, normalizedAge);
                #ifdef RENDERER_VOL_RADIAL_IS_RANDOM_TWO
                    radial = mix(evaluateParticleCurve(renderer_VOLRadialMinCurve, normalizedAge), radial, attributes.a_Random1.y);
                #endif
                return radial;
            #endif
        }
    #endif
#endif

#endif
