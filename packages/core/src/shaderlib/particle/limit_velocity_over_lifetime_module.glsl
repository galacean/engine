#ifdef RENDERER_LVL_MODULE_ENABLED
    uniform int renderer_LVLSpace;
    uniform float renderer_LVLDampen;

    // Scalar limit
    #ifndef RENDERER_LVL_SEPARATE_AXES
        #ifdef RENDERER_LVL_LIMIT_CONSTANT_MODE
            uniform float renderer_LVLLimitMaxConst;
            #ifdef RENDERER_LVL_LIMIT_IS_RANDOM_TWO
                uniform float renderer_LVLLimitMinConst;
            #endif
        #endif
        #ifdef RENDERER_LVL_LIMIT_CURVE_MODE
            uniform vec2 renderer_LVLLimitMaxCurve[4];
            #ifdef RENDERER_LVL_LIMIT_IS_RANDOM_TWO
                uniform vec2 renderer_LVLLimitMinCurve[4];
            #endif
        #endif
    #endif

    // Per-axis limit
    #ifdef RENDERER_LVL_SEPARATE_AXES
        #ifdef RENDERER_LVL_LIMIT_CONSTANT_MODE
            uniform vec3 renderer_LVLLimitMaxConstVector;
            #ifdef RENDERER_LVL_LIMIT_IS_RANDOM_TWO
                uniform vec3 renderer_LVLLimitMinConstVector;
            #endif
        #endif
        #ifdef RENDERER_LVL_LIMIT_CURVE_MODE
            uniform vec2 renderer_LVLLimitXMaxCurve[4];
            uniform vec2 renderer_LVLLimitYMaxCurve[4];
            uniform vec2 renderer_LVLLimitZMaxCurve[4];
            #ifdef RENDERER_LVL_LIMIT_IS_RANDOM_TWO
                uniform vec2 renderer_LVLLimitXMinCurve[4];
                uniform vec2 renderer_LVLLimitYMinCurve[4];
                uniform vec2 renderer_LVLLimitZMinCurve[4];
            #endif
        #endif
    #endif

    // Drag curve
    #ifdef RENDERER_LVL_DRAG_CURVE_MODE
        uniform vec2 renderer_LVLDragMaxCurve[4];
        #ifdef RENDERER_LVL_DRAG_IS_RANDOM_TWO
            uniform vec2 renderer_LVLDragMinCurve[4];
        #endif
    #endif

    float evaluateLVLDrag(float normalizedAge, float dragRand) {
        #ifdef RENDERER_LVL_DRAG_CURVE_MODE
            float dragMax = evaluateParticleCurve(renderer_LVLDragMaxCurve, normalizedAge);
            #ifdef RENDERER_LVL_DRAG_IS_RANDOM_TWO
                float dragMin = evaluateParticleCurve(renderer_LVLDragMinCurve, normalizedAge);
                return mix(dragMin, dragMax, dragRand);
            #else
                return dragMax;
            #endif
        #else
            return mix(renderer_LVLDragConstant.x, renderer_LVLDragConstant.y, dragRand);
        #endif
    }

    vec3 applyLVLSpeedLimitTF(vec3 velocity, float normalizedAge, float limitRand, float effectiveDampen) {
        #ifdef RENDERER_LVL_SEPARATE_AXES
            vec3 limitValue;
            #ifdef RENDERER_LVL_LIMIT_CONSTANT_MODE
                limitValue = renderer_LVLLimitMaxConstVector;
                #ifdef RENDERER_LVL_LIMIT_IS_RANDOM_TWO
                    limitValue = mix(renderer_LVLLimitMinConstVector, limitValue, limitRand);
                #endif
            #endif
            #ifdef RENDERER_LVL_LIMIT_CURVE_MODE
                limitValue = vec3(
                    evaluateParticleCurve(renderer_LVLLimitXMaxCurve, normalizedAge),
                    evaluateParticleCurve(renderer_LVLLimitYMaxCurve, normalizedAge),
                    evaluateParticleCurve(renderer_LVLLimitZMaxCurve, normalizedAge)
                );
                #ifdef RENDERER_LVL_LIMIT_IS_RANDOM_TWO
                    vec3 minLimitValue = vec3(
                        evaluateParticleCurve(renderer_LVLLimitXMinCurve, normalizedAge),
                        evaluateParticleCurve(renderer_LVLLimitYMinCurve, normalizedAge),
                        evaluateParticleCurve(renderer_LVLLimitZMinCurve, normalizedAge)
                    );
                    limitValue = mix(minLimitValue, limitValue, limitRand);
                #endif
            #endif

            vec3 absVel = abs(velocity);
            vec3 excess = max(absVel - limitValue, vec3(0.0));
            velocity = sign(velocity) * (absVel - excess * effectiveDampen);
        #else
            float limitValue;
            #ifdef RENDERER_LVL_LIMIT_CONSTANT_MODE
                limitValue = renderer_LVLLimitMaxConst;
                #ifdef RENDERER_LVL_LIMIT_IS_RANDOM_TWO
                    limitValue = mix(renderer_LVLLimitMinConst, limitValue, limitRand);
                #endif
            #endif
            #ifdef RENDERER_LVL_LIMIT_CURVE_MODE
                limitValue = evaluateParticleCurve(renderer_LVLLimitMaxCurve, normalizedAge);
                #ifdef RENDERER_LVL_LIMIT_IS_RANDOM_TWO
                    float minLimitValue = evaluateParticleCurve(renderer_LVLLimitMinCurve, normalizedAge);
                    limitValue = mix(minLimitValue, limitValue, limitRand);
                #endif
            #endif

            float speed = length(velocity);
            if (speed > limitValue && speed > 0.0) {
                float excess = speed - limitValue;
                velocity = velocity * ((speed - excess * effectiveDampen) / speed);
            }
        #endif
        return velocity;
    }

#endif
