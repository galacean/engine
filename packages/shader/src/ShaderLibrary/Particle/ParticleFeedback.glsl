#ifndef PARTICLE_FEEDBACK_INCLUDED
#define PARTICLE_FEEDBACK_INCLUDED

// Transform Feedback update shader for particle simulation.
// Update order: VOL/FOL -> Dampen -> Drag -> Position.
// Runs once per particle per frame (no rasterization).

// Previous frame TF data
vec3 a_FeedbackPosition;
vec3 a_FeedbackVelocity;

// Per-particle instance data
vec4 a_ShapePositionStartLifeTime;
vec4 a_DirectionTime;
vec3 a_StartSize;
float a_StartSpeed;
vec4 a_Random0;
vec4 a_Random1;
vec3 a_SimulationWorldPosition;
vec4 a_SimulationWorldRotation;
vec4 a_Random2;

// Uniforms
float renderer_CurrentTime;
float renderer_DeltaTime;
vec3 renderer_Gravity;
vec2 renderer_LVLDragConstant;
vec3 renderer_WorldPosition;
vec4 renderer_WorldRotation;
int renderer_SimulationSpace;

// TF outputs
vec3 v_FeedbackPosition;
vec3 v_FeedbackVelocity;

#include <Particle/ParticleCommon.glsl>
#include <Particle/Module/VelocityOverLifetime.glsl>
#include <Particle/Module/ForceOverLifetime.glsl>
#include <Particle/Module/LimitVelocityOverLifetime.glsl>

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
    // Clamp to age on the first TF pass: particles emitted mid-frame have age < dt,
    // so using the full dt would over-integrate. Subsequent passes are unaffected (age >= dt).
    float dt = min(renderer_DeltaTime, age);

    // normalizedAge < 0.0: stale TF slot whose startTime is from a previous playback (e.g. after StopEmittingAndClear).
    if (normalizedAge >= 1.0 || normalizedAge < 0.0) {
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
    vec4 invWorldRotation = quaternionConjugate(worldRotation);

    // Read previous frame state (initialized by CPU on particle birth)
    vec3 localVelocity = a_FeedbackVelocity;

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

    // FOL acceleration -> velocity delta (always persisted, like gravity)
    vec3 folDeltaLocal = vec3(0.0);
    #ifdef _FOL_MODULE_ENABLED
        vec3 folAcc = getFOLAcceleration(normalizedAge);
        vec3 folVelDelta = folAcc * dt;
        if (renderer_FOLSpace == 0) {
            folDeltaLocal = folVelDelta;
        } else {
            // World FOL: convert to local and persist, same as gravity
            folDeltaLocal = rotationByQuaternions(folVelDelta, invWorldRotation);
        }
    #endif

    // Gravity and FOL contribute to base velocity (persisted, subject to dampen/drag).
    vec3 gravityLocal = rotationByQuaternions(gravityDelta, invWorldRotation);
    localVelocity += folDeltaLocal + gravityLocal;

    // =====================================================
    // Step 2 & 3: Dampen (Limit Velocity) + Drag
    // VOL must be projected into the LVL target space so that
    // limit/drag see the full velocity regardless of VOL.space vs LVL.space.
    // =====================================================
    #ifdef RENDERER_LVL_MODULE_ENABLED
        // Precompute VOL in both spaces
        vec3 volAsLocal = volLocal + rotationByQuaternions(volWorld, invWorldRotation);
        vec3 volAsWorld = rotationByQuaternions(volLocal, worldRotation) + volWorld;

        float limitRand = a_Random2.w;
        float dampen = renderer_LVLDampen;
        // Frame-rate independent dampen (30fps as reference)
        float effectiveDampen = 1.0 - pow(1.0 - dampen, dt * 30.0);

        if (renderer_LVLSpace == 0) {
            // Local space: total = base + all VOL projected to local
            vec3 totalLocal = localVelocity + volAsLocal;
            vec3 dampenedTotal = applyLVLSpeedLimitTF(totalLocal, normalizedAge, limitRand, effectiveDampen);
            localVelocity = dampenedTotal - volAsLocal;
        } else {
            // World space: total = rotated base + all VOL projected to world
            vec3 totalWorld = rotationByQuaternions(localVelocity, worldRotation) + volAsWorld;
            vec3 dampenedTotal = applyLVLSpeedLimitTF(totalWorld, normalizedAge, limitRand, effectiveDampen);
            localVelocity = rotationByQuaternions(dampenedTotal - volAsWorld, invWorldRotation);
        }

        // Drag: same space as dampen
        {
            float dragCoeff = evaluateLVLDrag(normalizedAge, a_Random2.w);
            if (dragCoeff > 0.0) {
                vec3 totalVel;
                if (renderer_LVLSpace == 0) {
                    totalVel = localVelocity + volAsLocal;
                } else {
                    totalVel = rotationByQuaternions(localVelocity, worldRotation) + volAsWorld;
                }
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
                    vec3 draggedTotal = totalVel * (newVelMag / velMag);
                    if (renderer_LVLSpace == 0) {
                        localVelocity = draggedTotal - volAsLocal;
                    } else {
                        localVelocity = rotationByQuaternions(draggedTotal - volAsWorld, invWorldRotation);
                    }
                }
            }
        }
    #endif

    // =====================================================
    // Step 4: Integrate position in simulation space
    // Local mode: position in local space, velocity rotated to local
    // World mode: position in world space, velocity rotated to world
    // =====================================================
    // FOL is now fully in localVelocity (both local and world-space FOL).
    // Only VOL overlay needs to be added here.
    vec3 totalVelocity;
    if (renderer_SimulationSpace == 0) {
      // Local: integrate in local space
      totalVelocity = localVelocity + volLocal
        + rotationByQuaternions(volWorld, invWorldRotation);
    } else {
      // World: integrate in world space
      totalVelocity = rotationByQuaternions(localVelocity + volLocal, worldRotation) + volWorld;
    }
    vec3 position = a_FeedbackPosition + totalVelocity * dt;

    v_FeedbackPosition = position;
    v_FeedbackVelocity = localVelocity;
    gl_Position = vec4(0.0);
}

#endif
