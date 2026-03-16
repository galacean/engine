// Transform Feedback update shader for particle simulation.
// Update order: VOL/FOL → Dampen → Drag → Position.
// Runs once per particle per frame (no rasterization).

// Previous frame TF data
attribute vec3 a_TFPosition;
attribute vec3 a_TFVelocity;

// Per-particle instance data
attribute vec4 a_ShapePositionStartLifeTime;
attribute vec4 a_DirectionTime;
attribute vec3 a_StartSize;
attribute float a_StartSpeed;
attribute vec4 a_Random0;
attribute vec4 a_Random1;
attribute vec3 a_SimulationWorldPosition;
attribute vec4 a_SimulationWorldRotation;
attribute vec4 a_Random2;

// Uniforms
uniform float renderer_CurrentTime;
uniform float renderer_DeltaTime;
uniform vec3 renderer_Gravity;
uniform vec2 u_DragConstant;
uniform vec3 renderer_WorldPosition;
uniform vec4 renderer_WorldRotation;
uniform int renderer_SimulationSpace;

// TF outputs
varying vec3 v_TFPosition;
varying vec3 v_TFVelocity;

#include <particle_common>
#include <velocity_over_lifetime_module>
#include <force_over_lifetime_module>
#include <limit_velocity_over_lifetime_module>

// Get VOL instantaneous velocity at normalizedAge
vec3 getVOLVelocity(float normalizedAge) {
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

// Get FOL instantaneous acceleration at normalizedAge
vec3 getFOLAcceleration(float normalizedAge) {
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

void main() {
    float age = renderer_CurrentTime - a_DirectionTime.w;
    float lifetime = a_ShapePositionStartLifeTime.w;
    float normalizedAge = age / lifetime;
    float dt = renderer_DeltaTime;

    // Dead particle: pass through unchanged
    if (normalizedAge >= 1.0 || age < 0.0) {
        v_TFPosition = a_TFPosition;
        v_TFVelocity = a_TFVelocity;
        gl_Position = vec4(0.0);
        return;
    }

    vec4 worldRotation;
    if (renderer_SimulationSpace == 0) {
        worldRotation = renderer_WorldRotation;
    } else {
        worldRotation = a_SimulationWorldRotation;
    }

    // Read previous frame state (initialized by CPU on particle birth)
    vec3 localVelocity = a_TFVelocity;
    vec3 worldPosition = a_TFPosition;

    // =====================================================
    // Step 1: Apply velocity module deltas (VOL + FOL + Gravity)
    // =====================================================

    // Gravity (world space)
    vec3 gravityDelta = renderer_Gravity * a_Random0.x * dt;

    // VOL delta (change in instantaneous velocity this frame)
    vec3 volDeltaLocal = vec3(0.0);
    vec3 volDeltaWorld = vec3(0.0);
    #ifdef _VOL_MODULE_ENABLED
        float prevNormalizedAge = max(age - dt, 0.0) / lifetime;
        vec3 curVOL = getVOLVelocity(normalizedAge);
        vec3 prevVOL = getVOLVelocity(prevNormalizedAge);
        vec3 volDelta = curVOL - prevVOL;
        if (renderer_VOLSpace == 0) {
            volDeltaLocal = volDelta;
        } else {
            volDeltaWorld = volDelta;
        }
    #endif

    // FOL acceleration → velocity delta
    vec3 folDeltaLocal = vec3(0.0);
    vec3 folDeltaWorld = vec3(0.0);
    #ifdef _FOL_MODULE_ENABLED
        vec3 folAcc = getFOLAcceleration(normalizedAge);
        vec3 folVelDelta = folAcc * dt;
        if (renderer_FOLSpace == 0) {
            folDeltaLocal = folVelDelta;
        } else {
            folDeltaWorld = folVelDelta;
        }
    #endif

    // Add velocity deltas to local velocity
    localVelocity += volDeltaLocal + folDeltaLocal;

    // =====================================================
    // Step 2: Dampen (Limit Velocity)
    // =====================================================
    #ifdef RENDERER_LVL_MODULE_ENABLED
        float limitRand = a_Random2.w;
        float dampen = renderer_LVLDampen;
        // Frame-rate independent dampen (30fps as reference)
        float effectiveDampen = 1.0 - pow(1.0 - dampen, dt * 30.0);

        if (renderer_LVLSpace == 0) {
            localVelocity = applyLVLSpeedLimitTF(localVelocity, normalizedAge, limitRand, effectiveDampen);
        } else {
            // World space: exclude animatedVelocity from permanent dampen.
            vec3 animatedWorld = volDeltaWorld + folDeltaWorld + gravityDelta;
            vec3 localWorld = rotationByQuaternions(localVelocity, worldRotation);
            vec3 totalWorld = localWorld + animatedWorld;
            vec3 dampenedTotal = applyLVLSpeedLimitTF(totalWorld, normalizedAge, limitRand, effectiveDampen);
            // Delta applies only to the local velocity portion
            vec3 dampenedLocal = dampenedTotal - animatedWorld;
            localVelocity = rotationByQuaternions(dampenedLocal, quaternionConjugate(worldRotation));
        }
    #endif

    // =====================================================
    // Step 3: Drag
    // =====================================================
    #ifdef RENDERER_LVL_MODULE_ENABLED
    {
        float dragCoeff = evaluateLVLDrag(normalizedAge, a_Random0.x);
        if (dragCoeff > 0.0) {
            vec3 combinedVel = localVelocity;
            float velMagSqr = dot(combinedVel, combinedVel);
            float velMag = sqrt(velMagSqr);

            float drag = dragCoeff;

            #ifdef RENDERER_LVL_DRAG_MULTIPLY_SIZE
                float maxDim = max(a_StartSize.x, max(a_StartSize.y, a_StartSize.z));
                float radius = maxDim * 0.5;
                drag *= 3.14159265 * radius * radius;
            #endif

            #ifdef RENDERER_LVL_DRAG_MULTIPLY_VELOCITY
                drag *= velMagSqr;
            #endif

            if (velMag > 0.0) {
                float newVelMag = max(0.0, velMag - drag * dt);
                localVelocity = localVelocity * (newVelMag / velMag);
            }
        }
    }
    #endif

    // =====================================================
    // Step 4: Integrate position
    // =====================================================
    vec3 worldVelocity = rotationByQuaternions(localVelocity, worldRotation) + volDeltaWorld + folDeltaWorld + gravityDelta;
    worldPosition += worldVelocity * dt;

    v_TFPosition = worldPosition;
    v_TFVelocity = localVelocity;
    gl_Position = vec4(0.0);
}
