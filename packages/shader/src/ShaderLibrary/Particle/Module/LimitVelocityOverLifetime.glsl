#ifndef LIMIT_VELOCITY_OVER_LIFETIME_INCLUDED
#define LIMIT_VELOCITY_OVER_LIFETIME_INCLUDED

#ifdef RENDERER_LVL_MODULE_ENABLED
    int renderer_LVLSpace;
    float renderer_LVLDampen;

    // Scalar limit
    #ifndef RENDERER_LVL_SEPARATE_AXES
        #ifdef RENDERER_LVL_SPEED_CONSTANT_MODE
            float renderer_LVLSpeedMaxConst;
            #ifdef RENDERER_LVL_SPEED_IS_RANDOM_TWO
                float renderer_LVLSpeedMinConst;
            #endif
        #endif
        #ifdef RENDERER_LVL_SPEED_CURVE_MODE
            vec2 renderer_LVLSpeedMaxCurve[4];
            #ifdef RENDERER_LVL_SPEED_IS_RANDOM_TWO
                vec2 renderer_LVLSpeedMinCurve[4];
            #endif
        #endif
    #endif

    // Per-axis limit
    #ifdef RENDERER_LVL_SEPARATE_AXES
        #ifdef RENDERER_LVL_SPEED_CONSTANT_MODE
            vec3 renderer_LVLSpeedMaxConstVector;
            #ifdef RENDERER_LVL_SPEED_IS_RANDOM_TWO
                vec3 renderer_LVLSpeedMinConstVector;
            #endif
        #endif
        #ifdef RENDERER_LVL_SPEED_CURVE_MODE
            vec2 renderer_LVLSpeedXMaxCurve[4];
            vec2 renderer_LVLSpeedYMaxCurve[4];
            vec2 renderer_LVLSpeedZMaxCurve[4];
            #ifdef RENDERER_LVL_SPEED_IS_RANDOM_TWO
                vec2 renderer_LVLSpeedXMinCurve[4];
                vec2 renderer_LVLSpeedYMinCurve[4];
                vec2 renderer_LVLSpeedZMinCurve[4];
            #endif
        #endif
    #endif

    // Drag curve
    #ifdef RENDERER_LVL_DRAG_CURVE_MODE
        vec2 renderer_LVLDragMaxCurve[4];
        #ifdef RENDERER_LVL_DRAG_IS_RANDOM_TWO
            vec2 renderer_LVLDragMinCurve[4];
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
            vec3 limitSpeed;
            #ifdef RENDERER_LVL_SPEED_CONSTANT_MODE
                limitSpeed = renderer_LVLSpeedMaxConstVector;
                #ifdef RENDERER_LVL_SPEED_IS_RANDOM_TWO
                    limitSpeed = mix(renderer_LVLSpeedMinConstVector, limitSpeed, limitRand);
                #endif
            #endif
            #ifdef RENDERER_LVL_SPEED_CURVE_MODE
                limitSpeed = vec3(
                    evaluateParticleCurve(renderer_LVLSpeedXMaxCurve, normalizedAge),
                    evaluateParticleCurve(renderer_LVLSpeedYMaxCurve, normalizedAge),
                    evaluateParticleCurve(renderer_LVLSpeedZMaxCurve, normalizedAge)
                );
                #ifdef RENDERER_LVL_SPEED_IS_RANDOM_TWO
                    vec3 minLimitSpeed = vec3(
                        evaluateParticleCurve(renderer_LVLSpeedXMinCurve, normalizedAge),
                        evaluateParticleCurve(renderer_LVLSpeedYMinCurve, normalizedAge),
                        evaluateParticleCurve(renderer_LVLSpeedZMinCurve, normalizedAge)
                    );
                    limitSpeed = mix(minLimitSpeed, limitSpeed, limitRand);
                #endif
            #endif

            vec3 absVel = abs(velocity);
            vec3 excess = max(absVel - limitSpeed, vec3(0.0));
            velocity = sign(velocity) * (absVel - excess * effectiveDampen);
        #else
            float limitSpeed;
            #ifdef RENDERER_LVL_SPEED_CONSTANT_MODE
                limitSpeed = renderer_LVLSpeedMaxConst;
                #ifdef RENDERER_LVL_SPEED_IS_RANDOM_TWO
                    limitSpeed = mix(renderer_LVLSpeedMinConst, limitSpeed, limitRand);
                #endif
            #endif
            #ifdef RENDERER_LVL_SPEED_CURVE_MODE
                limitSpeed = evaluateParticleCurve(renderer_LVLSpeedMaxCurve, normalizedAge);
                #ifdef RENDERER_LVL_SPEED_IS_RANDOM_TWO
                    float minLimitSpeed = evaluateParticleCurve(renderer_LVLSpeedMinCurve, normalizedAge);
                    limitSpeed = mix(minLimitSpeed, limitSpeed, limitRand);
                #endif
            #endif

            float speed = length(velocity);
            if (speed > limitSpeed && speed > 0.0) {
                float excess = speed - limitSpeed;
                velocity = velocity * ((speed - excess * effectiveDampen) / speed);
            }
        #endif
        return velocity;
    }

#endif

#endif
