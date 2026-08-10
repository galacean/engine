#ifndef INHERIT_VELOCITY_INCLUDED
#define INHERIT_VELOCITY_INCLUDED

#if defined(RENDERER_INHERIT_VELOCITY_CURRENT) || defined(RENDERER_INHERIT_VELOCITY_INITIAL_CURVE)
    #define _INHERIT_VELOCITY_MODULE_ENABLED

    #ifdef RENDERER_INHERIT_VELOCITY_CURRENT
        vec3 renderer_InheritVelocity;
    #endif

    #ifdef RENDERER_INHERIT_VELOCITY_CONSTANT_MODE
        float renderer_InheritVelocityMaxConst;
        #ifdef RENDERER_INHERIT_VELOCITY_RANDOM
            float renderer_InheritVelocityMinConst;
        #endif
    #endif

    #ifdef RENDERER_INHERIT_VELOCITY_CURVE_MODE
        vec2 renderer_InheritVelocityMaxCurve[4];
        #ifdef RENDERER_INHERIT_VELOCITY_RANDOM
            vec2 renderer_InheritVelocityMinCurve[4];
        #endif
    #endif

    #ifdef RENDERER_INHERIT_VELOCITY_RANDOM
        float getInheritVelocityRandom(Attributes attributes) {
            float random = attributes.a_InheritVelocity.w;
            #ifdef RENDERER_SUB_EMITTER_TRAJECTORY
                if (isSubEmitterParticle(attributes)) {
                    random = -random - 1.0;
                }
            #endif
            return random;
        }
    #endif

    float evaluateInheritVelocityFactor(Attributes attributes, float normalizedAge) {
        float factor = 0.0;
        #ifdef RENDERER_INHERIT_VELOCITY_RANDOM
            float random = getInheritVelocityRandom(attributes);
        #endif

        #ifdef RENDERER_INHERIT_VELOCITY_CONSTANT_MODE
            factor = renderer_InheritVelocityMaxConst;
            #ifdef RENDERER_INHERIT_VELOCITY_RANDOM
                factor = mix(renderer_InheritVelocityMinConst, factor, random);
            #endif
        #endif

        #ifdef RENDERER_INHERIT_VELOCITY_CURVE_MODE
            factor = evaluateParticleCurve(renderer_InheritVelocityMaxCurve, normalizedAge);
            #ifdef RENDERER_INHERIT_VELOCITY_RANDOM
                factor = mix(
                    evaluateParticleCurve(renderer_InheritVelocityMinCurve, normalizedAge),
                    factor,
                    random);
            #endif
        #endif

        return factor;
    }

    vec3 evaluateInheritVelocityFromSource(
        Attributes attributes,
        vec3 sourceVelocity,
        float normalizedAge
    ) {
        return sourceVelocity * evaluateInheritVelocityFactor(attributes, normalizedAge);
    }

    vec3 evaluateInheritVelocity(Attributes attributes, float normalizedAge) {
        #ifdef RENDERER_INHERIT_VELOCITY_INITIAL_CURVE
            return evaluateInheritVelocityFromSource(attributes, attributes.a_InheritVelocity.xyz, normalizedAge);
        #else
            return evaluateInheritVelocityFromSource(attributes, renderer_InheritVelocity, normalizedAge);
        #endif
    }

    #ifdef RENDERER_INHERIT_VELOCITY_INITIAL_CURVE
        vec3 computeInitialInheritVelocityPositionOffsetFromSource(
            Attributes attributes,
            vec3 sourceVelocity,
            float normalizedAge,
            out vec3 currentVelocity
        ) {
            #ifdef RENDERER_INHERIT_VELOCITY_RANDOM
                float random = getInheritVelocityRandom(attributes);
            #endif
            float currentFactor;
            float cumulativeFactor = evaluateParticleCurveCumulative(
                renderer_InheritVelocityMaxCurve,
                normalizedAge,
                currentFactor);

            #ifdef RENDERER_INHERIT_VELOCITY_RANDOM
                float minCurrentFactor;
                float minCumulativeFactor = evaluateParticleCurveCumulative(
                    renderer_InheritVelocityMinCurve,
                    normalizedAge,
                    minCurrentFactor);
                currentFactor = mix(minCurrentFactor, currentFactor, random);
                cumulativeFactor = mix(minCumulativeFactor, cumulativeFactor, random);
            #endif

            currentVelocity = sourceVelocity * currentFactor;
            return sourceVelocity * cumulativeFactor * attributes.a_ShapePositionStartLifeTime.w;
        }
    #endif
#endif

#endif
