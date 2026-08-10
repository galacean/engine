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
            #ifdef RENDERER_HAS_SUB_EMITTER_SPAWNED_PARTICLES
                if (isSubEmitterSpawnedParticle(attributes)) {
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

    vec3 getInheritVelocitySource(Attributes attributes) {
        #ifdef RENDERER_INHERIT_VELOCITY_INITIAL_CURVE
            #ifdef RENDERER_HAS_SUB_EMITTER_SPAWNED_PARTICLES
                if (isSubEmitterSpawnedParticle(attributes)) {
                    return attributes.a_ParentTrajectoryVelocity;
                }
            #endif
            return attributes.a_InheritVelocity.xyz;
        #else
            return renderer_InheritVelocity;
        #endif
    }

    vec3 evaluateInheritVelocity(Attributes attributes, float normalizedAge) {
        return getInheritVelocitySource(attributes) * evaluateInheritVelocityFactor(attributes, normalizedAge);
    }

    #ifdef RENDERER_INHERIT_VELOCITY_INITIAL_CURVE
        vec3 computeInitialInheritVelocityPositionOffset(
            Attributes attributes,
            float normalizedAge,
            out vec3 currentVelocity
        ) {
            vec3 sourceVelocity = getInheritVelocitySource(attributes);
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
