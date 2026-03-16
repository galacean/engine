#ifdef RENDERER_LVL_MODULE_ENABLED
    uniform int renderer_LVLSpace;
    uniform float renderer_LVLDampen;

    // --- Limit uniforms (scalar mode, non-separate axes) ---
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

    // --- Limit uniforms (per-axis, separate axes) ---
    #ifdef RENDERER_LVL_SEPARATE_AXES
        #ifdef RENDERER_LVL_LIMIT_CONSTANT_MODE
            uniform vec3 renderer_LVLLimitMaxConstVec;
            #ifdef RENDERER_LVL_LIMIT_IS_RANDOM_TWO
                uniform vec3 renderer_LVLLimitMinConstVec;
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

    // --- Drag curve uniforms ---
    #ifdef RENDERER_LVL_DRAG_CURVE_MODE
        uniform vec2 renderer_LVLDragMaxCurve[4];
        uniform vec2 renderer_LVLDragMinCurve[4];
    #endif

    // Evaluate drag at a given normalizedAge
    float evaluateLVLDrag(float normalizedAge, float dragRand) {
        #ifdef RENDERER_LVL_DRAG_CURVE_MODE
            float dragMax = evaluateParticleCurve(renderer_LVLDragMaxCurve, normalizedAge);
            float dragMin = evaluateParticleCurve(renderer_LVLDragMinCurve, normalizedAge);
            return mix(dragMin, dragMax, dragRand);
        #else
            return mix(u_DragConstant.x, u_DragConstant.y, dragRand);
        #endif
    }

    // Get instantaneous VOL velocity at a given normalizedAge
    vec3 getLVLVOLVelocity(float normalizedAge) {
        vec3 vel = vec3(0.0);
        #ifdef _VOL_MODULE_ENABLED
            #ifdef RENDERER_VOL_CONSTANT_MODE
                vel = renderer_VOLMaxConst;
                #ifdef RENDERER_VOL_IS_RANDOM_TWO
                    vel = mix(renderer_VOLMinConst, vel, a_Random1.yzw);
                #endif
            #endif
            #ifdef RENDERER_VOL_CURVE_MODE
                vel = vec3(
                    evaluateParticleCurve(renderer_VOLMaxGradientX, normalizedAge),
                    evaluateParticleCurve(renderer_VOLMaxGradientY, normalizedAge),
                    evaluateParticleCurve(renderer_VOLMaxGradientZ, normalizedAge)
                );
                #ifdef RENDERER_VOL_IS_RANDOM_TWO
                    vec3 minVel = vec3(
                        evaluateParticleCurve(renderer_VOLMinGradientX, normalizedAge),
                        evaluateParticleCurve(renderer_VOLMinGradientY, normalizedAge),
                        evaluateParticleCurve(renderer_VOLMinGradientZ, normalizedAge)
                    );
                    vel = mix(minVel, vel, a_Random1.yzw);
                #endif
            #endif
        #endif
        return vel;
    }

    // Get instantaneous FOL acceleration at a given normalizedAge
    vec3 getLVLFOLAcceleration(float normalizedAge) {
        vec3 acc = vec3(0.0);
        #ifdef _FOL_MODULE_ENABLED
            #ifdef RENDERER_FOL_CONSTANT_MODE
                acc = renderer_FOLMaxConst;
                #ifdef RENDERER_FOL_IS_RANDOM_TWO
                    acc = mix(renderer_FOLMinConst, acc, vec3(a_Random2.x, a_Random2.y, a_Random2.z));
                #endif
            #endif
            #ifdef RENDERER_FOL_CURVE_MODE
                acc = vec3(
                    evaluateParticleCurve(renderer_FOLMaxGradientX, normalizedAge),
                    evaluateParticleCurve(renderer_FOLMaxGradientY, normalizedAge),
                    evaluateParticleCurve(renderer_FOLMaxGradientZ, normalizedAge)
                );
                #ifdef RENDERER_FOL_IS_RANDOM_TWO
                    vec3 minAcc = vec3(
                        evaluateParticleCurve(renderer_FOLMinGradientX, normalizedAge),
                        evaluateParticleCurve(renderer_FOLMinGradientY, normalizedAge),
                        evaluateParticleCurve(renderer_FOLMinGradientZ, normalizedAge)
                    );
                    acc = mix(minAcc, acc, vec3(a_Random2.x, a_Random2.y, a_Random2.z));
                #endif
            #endif
        #endif
        return acc;
    }

    // Apply speed limit with dampen
    vec3 applyLVLSpeedLimit(vec3 velocity, float normalizedAge, float limitRand) {
        float dampen = renderer_LVLDampen;

        #ifdef RENDERER_LVL_SEPARATE_AXES
            // Per-axis limiting
            vec3 limitVal;
            #ifdef RENDERER_LVL_LIMIT_CONSTANT_MODE
                limitVal = renderer_LVLLimitMaxConstVec;
                #ifdef RENDERER_LVL_LIMIT_IS_RANDOM_TWO
                    limitVal = mix(renderer_LVLLimitMinConstVec, limitVal, limitRand);
                #endif
            #endif
            #ifdef RENDERER_LVL_LIMIT_CURVE_MODE
                limitVal = vec3(
                    evaluateParticleCurve(renderer_LVLLimitXMaxCurve, normalizedAge),
                    evaluateParticleCurve(renderer_LVLLimitYMaxCurve, normalizedAge),
                    evaluateParticleCurve(renderer_LVLLimitZMaxCurve, normalizedAge)
                );
                #ifdef RENDERER_LVL_LIMIT_IS_RANDOM_TWO
                    vec3 minLimitVal = vec3(
                        evaluateParticleCurve(renderer_LVLLimitXMinCurve, normalizedAge),
                        evaluateParticleCurve(renderer_LVLLimitYMinCurve, normalizedAge),
                        evaluateParticleCurve(renderer_LVLLimitZMinCurve, normalizedAge)
                    );
                    limitVal = mix(minLimitVal, limitVal, limitRand);
                #endif
            #endif

            vec3 absVel = abs(velocity);
            vec3 excess = max(absVel - limitVal, vec3(0.0));
            vec3 dampedVel = sign(velocity) * (absVel - excess * dampen);
            velocity = dampedVel;
        #else
            // Scalar speed limiting
            float limitVal;
            #ifdef RENDERER_LVL_LIMIT_CONSTANT_MODE
                limitVal = renderer_LVLLimitMaxConst;
                #ifdef RENDERER_LVL_LIMIT_IS_RANDOM_TWO
                    limitVal = mix(renderer_LVLLimitMinConst, limitVal, limitRand);
                #endif
            #endif
            #ifdef RENDERER_LVL_LIMIT_CURVE_MODE
                limitVal = evaluateParticleCurve(renderer_LVLLimitMaxCurve, normalizedAge);
                #ifdef RENDERER_LVL_LIMIT_IS_RANDOM_TWO
                    float minLimitVal = evaluateParticleCurve(renderer_LVLLimitMinCurve, normalizedAge);
                    limitVal = mix(minLimitVal, limitVal, limitRand);
                #endif
            #endif

            float speed = length(velocity);
            if (speed > limitVal && speed > 0.0) {
                float excess = speed - limitVal;
                float newSpeed = speed - excess * dampen;
                velocity = velocity * (newSpeed / speed);
            }
        #endif

        return velocity;
    }

    // Main sampling function: N=8 iterative dampen with trapezoidal integration
    // Dampen compounds across iterations: each step starts from previously dampened velocity
    // and adds only new velocity deltas (gravity, FOL, VOL, drag changes).
    //
    // Local space mode: tracks dampedLocalVel (local space), dampen compounds on it directly.
    // World space mode: tracks dampedWorldVel (world space combined velocity), all deltas
    //   are converted to world space before adding. Dampen compounds on the combined world velocity.
    vec3 computeParticlePositionLVL(
        in vec3 startVelocity,
        in float age,
        in float lifetime,
        in vec3 gravityAcceleration,
        in vec4 worldRotation,
        in float limitRand,
        in float dragRand,
        in vec3 particleSize,
        inout vec3 outLocalVelocity,
        inout vec3 outWorldVelocity
    ) {
        vec3 worldPosition = vec3(0.0);
        float dt = age / 8.0;

        // Track previous values for delta computation
        vec3 prevFOLAccLocal = vec3(0.0);
        vec3 prevFOLAccWorld = vec3(0.0);
        vec3 prevVOLLocal = vec3(0.0);
        vec3 prevVOLWorld = vec3(0.0);
        float prevDragFactor = 1.0;

        // --- Initialize velocities ---
        // For local space: dampedLocalVel tracks local velocity, undampedWorldVel tracks world velocity
        // For world space: dampedWorldVel tracks combined world velocity (dampen compounds on it)
        vec3 dampedLocalVel = startVelocity;
        vec3 undampedWorldVel = vec3(0.0);
        vec3 dampedWorldVel = rotationByQuaternions(startVelocity, worldRotation);

        #ifdef _VOL_MODULE_ENABLED
            vec3 vol0 = getLVLVOLVelocity(0.0);
            if (renderer_VOLSpace == 0) {
                dampedLocalVel += vol0;
                dampedWorldVel += rotationByQuaternions(vol0, worldRotation);
                prevVOLLocal = vol0;
            } else {
                undampedWorldVel += vol0;
                dampedWorldVel += vol0;
                prevVOLWorld = vol0;
            }
        #endif

        // Apply initial speed limit at t=0
        vec3 prevCombined;
        if (renderer_LVLSpace == 0) {
            dampedLocalVel = applyLVLSpeedLimit(dampedLocalVel, 0.0, limitRand);
            prevCombined = rotationByQuaternions(dampedLocalVel, worldRotation) + undampedWorldVel;
        } else {
            dampedWorldVel = applyLVLSpeedLimit(dampedWorldVel, 0.0, limitRand);
            prevCombined = dampedWorldVel;
        }

        for (int i = 1; i <= 8; i++) {
            float t = dt * float(i);
            float nAge = t / lifetime;

            // --- 1. Delta from drag on startVelocity ---
            float dragVal = evaluateLVLDrag(nAge, dragRand);
            #ifdef RENDERER_LVL_DRAG_MULTIPLY_SIZE
                dragVal *= length(particleSize);
            #endif

            float curDragFactor = 1.0;
            float speed = length(startVelocity);
            if (dragVal > 0.0 && speed > 0.0) {
                #ifdef RENDERER_LVL_DRAG_MULTIPLY_VELOCITY
                    curDragFactor = 1.0 / (1.0 + dragVal * t);
                #else
                    float stopTime = speed / dragVal;
                    curDragFactor = max(1.0 - dragVal * min(t, stopTime) / speed, 0.0);
                #endif
            }
            vec3 dragDelta = startVelocity * (curDragFactor - prevDragFactor);
            dampedLocalVel += dragDelta;
            dampedWorldVel += rotationByQuaternions(dragDelta, worldRotation);
            prevDragFactor = curDragFactor;

            // --- 2. Delta from gravity ---
            vec3 gravityDelta = gravityAcceleration * dt;
            undampedWorldVel += gravityDelta;
            dampedWorldVel += gravityDelta;

            // --- 3. Delta from FOL (trapezoidal acceleration integration) ---
            vec3 folAcc = getLVLFOLAcceleration(nAge);
            vec3 folAccLocal = vec3(0.0);
            vec3 folAccWorld = vec3(0.0);
            #ifdef _FOL_MODULE_ENABLED
                if (renderer_FOLSpace == 0) {
                    folAccLocal = folAcc;
                } else {
                    folAccWorld = folAcc;
                }
            #endif
            vec3 folDeltaLocal = (prevFOLAccLocal + folAccLocal) * 0.5 * dt;
            vec3 folDeltaWorld = (prevFOLAccWorld + folAccWorld) * 0.5 * dt;
            dampedLocalVel += folDeltaLocal;
            undampedWorldVel += folDeltaWorld;
            dampedWorldVel += rotationByQuaternions(folDeltaLocal, worldRotation) + folDeltaWorld;
            prevFOLAccLocal = folAccLocal;
            prevFOLAccWorld = folAccWorld;

            // --- 4. Delta from VOL (change in instantaneous velocity) ---
            #ifdef _VOL_MODULE_ENABLED
                vec3 curVOL = getLVLVOLVelocity(nAge);
                if (renderer_VOLSpace == 0) {
                    vec3 volDelta = curVOL - prevVOLLocal;
                    dampedLocalVel += volDelta;
                    dampedWorldVel += rotationByQuaternions(volDelta, worldRotation);
                    prevVOLLocal = curVOL;
                } else {
                    vec3 volDelta = curVOL - prevVOLWorld;
                    undampedWorldVel += volDelta;
                    dampedWorldVel += volDelta;
                    prevVOLWorld = curVOL;
                }
            #endif

            // --- 5. Apply speed limit (dampen compounds across iterations!) ---
            vec3 combined;
            if (renderer_LVLSpace == 0) {
                // Local space: dampen local velocity, then combine with world
                dampedLocalVel = applyLVLSpeedLimit(dampedLocalVel, nAge, limitRand);
                combined = rotationByQuaternions(dampedLocalVel, worldRotation) + undampedWorldVel;
            } else {
                // World space: dampen combined world velocity directly
                dampedWorldVel = applyLVLSpeedLimit(dampedWorldVel, nAge, limitRand);
                combined = dampedWorldVel;
            }

            // --- 6. Trapezoidal integration for position ---
            worldPosition += (prevCombined + combined) * 0.5 * dt;
            prevCombined = combined;

            // Store final velocities for stretched billboard
            outLocalVelocity = dampedLocalVel;
            outWorldVelocity = (renderer_LVLSpace == 0) ? undampedWorldVel : dampedWorldVel;
        }

        // Add shape position (rotated to world)
        worldPosition += rotationByQuaternions(a_ShapePositionStartLifeTime.xyz, worldRotation);

        // Add simulation space offset
        if (renderer_SimulationSpace == 0) {
            worldPosition += renderer_WorldPosition;
        } else if (renderer_SimulationSpace == 1) {
            worldPosition += a_SimulationWorldPosition;
        }

        return worldPosition;
    }
#endif
