// Transform Feedback update shader for particle simulation.
// Update order: VOL/FOL → Dampen → Drag → Position.
// Runs once per particle per frame (no rasterization).

// Previous frame TF data
attribute vec3 a_FeedbackPosition;
attribute vec3 a_FeedbackVelocity;

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
uniform vec2 renderer_LVLDragConstant;
uniform vec3 renderer_WorldPosition;
uniform vec4 renderer_WorldRotation;
uniform int renderer_SimulationSpace;

// TF outputs
varying vec3 v_FeedbackPosition;
varying vec3 v_FeedbackVelocity;

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
        v_FeedbackPosition = a_FeedbackPosition;
        v_FeedbackVelocity = a_FeedbackVelocity;
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
    vec3 localVelocity = a_FeedbackVelocity;
    vec3 worldPosition = a_FeedbackPosition;

    // =====================================================
    // Step 1: Apply velocity module deltas (VOL + FOL + Gravity)
    // =====================================================

    // Gravity (world space)
    vec3 gravityDelta = renderer_Gravity * a_Random0.x * dt;

    // VOL instantaneous velocity (animated velocity, not persisted)
    vec3 volLocal = vec3(0.0);
    vec3 volWorld = vec3(0.0);
    #ifdef _VOL_MODULE_ENABLED
        vec3 vol = getVOLVelocity(normalizedAge);
        if (renderer_VOLSpace == 0) {
            volLocal = vol;
        } else {
            volWorld = vol;
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

    // Gravity and FOL contribute to base velocity (persisted, subject to dampen/drag).
    vec3 gravityLocal = rotationByQuaternions(gravityDelta, quaternionConjugate(worldRotation));
    localVelocity += folDeltaLocal + gravityLocal;

    // =====================================================
    // Step 2: Dampen (Limit Velocity)
    // Two-velocity system:
    //   base velocity (persisted) = startVelocity + FOL + gravity
    //   animated velocity (per-frame) = VOL
    // Dampen uses total (base + animated) to judge overspeed,
    // but only permanently modifies base velocity.
    // =====================================================
    #ifdef RENDERER_LVL_MODULE_ENABLED
        float limitRand = a_Random2.w;
        float dampen = renderer_LVLDampen;
        // Frame-rate independent dampen (30fps as reference)
        float effectiveDampen = 1.0 - pow(1.0 - dampen, dt * 30.0);

        if (renderer_LVLSpace == 0) {
            vec3 totalLocal = localVelocity + volLocal;
            vec3 dampenedTotal = applyLVLSpeedLimitTF(totalLocal, normalizedAge, limitRand, effectiveDampen);
            localVelocity = dampenedTotal - volLocal;
        } else {
            vec3 animatedWorld = volWorld;
            vec3 baseWorld = rotationByQuaternions(localVelocity, worldRotation);
            vec3 totalWorld = baseWorld + animatedWorld;
            vec3 dampenedTotal = applyLVLSpeedLimitTF(totalWorld, normalizedAge, limitRand, effectiveDampen);
            vec3 dampenedBase = dampenedTotal - animatedWorld;
            localVelocity = rotationByQuaternions(dampenedBase, quaternionConjugate(worldRotation));
        }
    #endif

    // =====================================================
    // Step 3: Drag
    // Drag also uses total velocity (base + animated), only modifies base.
    // =====================================================
    #ifdef RENDERER_LVL_MODULE_ENABLED
    {
        float dragCoeff = evaluateLVLDrag(normalizedAge, a_Random0.x);
        if (dragCoeff > 0.0) {
            vec3 totalVel = localVelocity + volLocal;
            float velMagSqr = dot(totalVel, totalVel);
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
                vec3 dampenedTotal = totalVel * (newVelMag / velMag);
                localVelocity = dampenedTotal - volLocal;
            }
        }
    }
    #endif

    // =====================================================
    // Step 4: Integrate position
    // localVelocity (base, includes gravity+FOL) is persisted in TF buffer.
    // VOL is added for integration only (not persisted).
    // =====================================================
    vec3 worldVelocity = rotationByQuaternions(localVelocity + volLocal, worldRotation) + volWorld + folDeltaWorld;
    worldPosition += worldVelocity * dt;

    v_FeedbackPosition = worldPosition;
    v_FeedbackVelocity = localVelocity;
    gl_Position = vec4(0.0);
}
