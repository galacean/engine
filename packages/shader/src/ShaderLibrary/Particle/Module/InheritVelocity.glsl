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

    float evaluateInheritVelocityFactor(Attributes attributes, float normalizedAge) {
        float factor = 0.0;

        #ifdef RENDERER_INHERIT_VELOCITY_CONSTANT_MODE
            factor = renderer_InheritVelocityMaxConst;
            #ifdef RENDERER_INHERIT_VELOCITY_RANDOM
                factor = mix(renderer_InheritVelocityMinConst, factor, attributes.a_InheritVelocity.w);
            #endif
        #endif

        #ifdef RENDERER_INHERIT_VELOCITY_CURVE_MODE
            factor = evaluateParticleCurve(renderer_InheritVelocityMaxCurve, normalizedAge);
            #ifdef RENDERER_INHERIT_VELOCITY_RANDOM
                factor = mix(
                    evaluateParticleCurve(renderer_InheritVelocityMinCurve, normalizedAge),
                    factor,
                    attributes.a_InheritVelocity.w);
            #endif
        #endif

        return factor;
    }

    vec3 evaluateInheritVelocity(Attributes attributes, float normalizedAge) {
        #ifdef RENDERER_INHERIT_VELOCITY_INITIAL_CURVE
            vec3 sourceVelocity = attributes.a_InheritVelocity.xyz;
        #else
            vec3 sourceVelocity = renderer_InheritVelocity;
        #endif
        return sourceVelocity * evaluateInheritVelocityFactor(attributes, normalizedAge);
    }

    #ifdef RENDERER_INHERIT_VELOCITY_INITIAL_CURVE
        vec3 computeInitialInheritVelocityPositionOffset(
            Attributes attributes,
            float normalizedAge,
            out vec3 currentVelocity
        ) {
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
                currentFactor = mix(minCurrentFactor, currentFactor, attributes.a_InheritVelocity.w);
                cumulativeFactor = mix(minCumulativeFactor, cumulativeFactor, attributes.a_InheritVelocity.w);
            #endif

            vec3 sourceVelocity = attributes.a_InheritVelocity.xyz;
            currentVelocity = sourceVelocity * currentFactor;
            return sourceVelocity * cumulativeFactor * attributes.a_ShapePositionStartLifeTime.w;
        }
    #endif
#endif

#endif
