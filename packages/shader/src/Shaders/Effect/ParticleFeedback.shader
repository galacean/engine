Shader "Effect/ParticleFeedback" {
  SubShader "Default" {
    Pass "TransformFeedback" {
      Tags { pipelineStage = "TransformFeedback" }

      VertexShader = main;
      FragmentShader = frag;

      #include "ShaderLibrary/Common/Common.glsl"

      // Uniforms
      float renderer_CurrentTime;
      float renderer_DeltaTime;
      vec3 renderer_Gravity;
      vec2 renderer_LVLDragConstant;
      vec3 renderer_WorldPosition;
      vec4 renderer_WorldRotation;
      int renderer_SimulationSpace;
      int renderer_FirstNewParticle;
      int renderer_FirstFreeParticle;
      #ifdef RENDERER_TRAJECTORY_FEEDBACK
          int renderer_ResetTrajectory;
      #endif

      struct Attributes {
          vec3 a_FeedbackPosition;
          vec3 a_FeedbackVelocity;
          #ifdef RENDERER_TRAJECTORY_FEEDBACK
              vec3 a_FeedbackWorldPosition;
          #endif
          vec4 a_ShapePositionStartLifeTime;
          vec4 a_DirectionTime;
          vec3 a_StartSize;
          float a_StartSpeed;
          vec4 a_Random0;

          #if defined(RENDERER_TSA_FRAME_RANDOM_CURVES) || defined(RENDERER_VOL_IS_RANDOM_TWO) || defined(RENDERER_VOL_ORBITAL_IS_RANDOM_TWO) || defined(RENDERER_VOL_RADIAL_IS_RANDOM_TWO)
              vec4 a_Random1;
          #endif

          vec3 a_SimulationWorldPosition;
          vec4 a_SimulationWorldRotation;

          #if defined(RENDERER_FOL_CONSTANT_MODE) || defined(RENDERER_FOL_CURVE_MODE) || defined(RENDERER_LVL_MODULE_ENABLED)
              vec4 a_Random2;
          #endif

          #if defined(RENDERER_INHERIT_VELOCITY_INITIAL_CURVE) || defined(RENDERER_INHERIT_VELOCITY_RANDOM) || defined(RENDERER_HAS_SUB_EMITTER_SPAWNED_PARTICLES)
              vec4 a_InheritVelocity;
          #endif

          #ifdef RENDERER_HAS_SUB_EMITTER_SPAWNED_PARTICLES
              vec3 a_ParentSampleWorldPosition;
              vec3 a_ParentTrajectoryVelocity;
          #endif

      };

      struct Varyings {
          vec3 v_FeedbackPosition;
          vec3 v_FeedbackVelocity;
          #ifdef RENDERER_TRAJECTORY_FEEDBACK
              vec3 v_FeedbackWorldPosition;
              vec3 v_FeedbackTrajectoryVelocity;
          #endif
      };

      // Module includes (after Attributes/Varyings)
      #include "ShaderLibrary/Particle/ParticleCommon.glsl"
      #include "ShaderLibrary/Particle/Module/InheritVelocity.glsl"
      #include "ShaderLibrary/Particle/Module/VelocityOverLifetime.glsl"
      #include "ShaderLibrary/Particle/Module/ForceOverLifetime.glsl"
      #include "ShaderLibrary/Particle/Module/LimitVelocityOverLifetime.glsl"
      #include "ShaderLibrary/Particle/Module/NoiseModule.glsl"

      vec3 getParticleWorldPosition(vec3 position) {
          return renderer_SimulationSpace == 0
              ? rotationByQuaternions(position, renderer_WorldRotation) + renderer_WorldPosition
              : position;
      }

      // Get FOL instantaneous acceleration at normalizedAge
      vec3 getFOLAcceleration(Attributes attributes, float normalizedAge) {
          vec3 acc = vec3(0.0);
          #ifdef _FOL_MODULE_ENABLED
              #ifdef RENDERER_FOL_CONSTANT_MODE
                  acc = renderer_FOLMaxConst;
                  #ifdef RENDERER_FOL_IS_RANDOM_TWO
                      acc = mix(renderer_FOLMinConst, acc, vec3(attributes.a_Random2.x, attributes.a_Random2.y, attributes.a_Random2.z));
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
                      acc = mix(minAcc, acc, vec3(attributes.a_Random2.x, attributes.a_Random2.y, attributes.a_Random2.z));
                  #endif
              #endif
          #endif
          return acc;
      }

      void simulateParticleStep(
          Attributes attr,
          float previousAge,
          float simulationAge,
          float lifetime,
          vec4 worldRotation,
          vec4 invWorldRotation,
          inout vec3 position,
          inout vec3 localVelocity
      ) {
          float dt = simulationAge - previousAge;
          float normalizedAge = simulationAge / lifetime;
          float previousNormalizedAge = previousAge / lifetime;
          vec3 inheritedVelocityWorld = vec3(0.0);
          vec3 simulationWorldPosition = attr.a_SimulationWorldPosition;

          #ifdef RENDERER_HAS_SUB_EMITTER_SPAWNED_PARTICLES
              if (isSubEmitterSpawnedParticle(attr)) {
                  simulationWorldPosition = reconstructParentWorldPositionAtEmission(attr);
              }
          #endif

          #ifdef RENDERER_INHERIT_VELOCITY_INITIAL_CURVE
              vec3 inheritedPositionOffsetWorld =
                  computeInitialInheritVelocityPositionOffset(
                      attr,
                      normalizedAge,
                      inheritedVelocityWorld
                  );
              vec3 previousInheritedPositionOffsetWorld =
                  computeInitialInheritVelocityPositionOffset(
                      attr,
                      previousNormalizedAge,
                      inheritedVelocityWorld
                  );
              // Use the interval average so linear integration reproduces the exact Initial displacement
              inheritedVelocityWorld =
                  (inheritedPositionOffsetWorld - previousInheritedPositionOffsetWorld) / dt;
          #elif defined(_INHERIT_VELOCITY_MODULE_ENABLED)
              inheritedVelocityWorld = evaluateInheritVelocity(attr, normalizedAge);
          #endif

          // Step 1: VOL + FOL + Gravity
          vec3 gravityDelta = renderer_Gravity * attr.a_Random0.x * dt;

          vec3 volLocal = vec3(0.0);
          vec3 volWorld = vec3(0.0);
          #ifdef _VOL_LINEAR_MODULE_ENABLED
              vec3 vol = evaluateVOLVelocity(attr, normalizedAge);
              if (renderer_VOLSpace == 0) {
                  volLocal = vol;
              } else {
                  volWorld = vol;
              }
          #endif

          vec3 folDeltaLocal = vec3(0.0);
          #ifdef _FOL_MODULE_ENABLED
              vec3 folAcc = getFOLAcceleration(attr, normalizedAge);
              vec3 folVelDelta = folAcc * dt;
              if (renderer_FOLSpace == 0) {
                  folDeltaLocal = folVelDelta;
              } else {
                  folDeltaLocal = rotationByQuaternions(folVelDelta, invWorldRotation);
              }
          #endif

          vec3 gravityLocal = rotationByQuaternions(gravityDelta, invWorldRotation);
          localVelocity += folDeltaLocal + gravityLocal;

          // Step 2 & 3: Dampen + Drag. LimitVelocityOverLifetime applies to base and linear VOL velocity;
          // orbital/radial motion is applied below as positional orbit integration.
          #ifdef RENDERER_LVL_MODULE_ENABLED
              vec3 velocityOffset;
              vec3 totalVelocity;
              if (renderer_LVLSpace == 0) {
                  velocityOffset =
                      volLocal + rotationByQuaternions(volWorld + inheritedVelocityWorld, invWorldRotation);
                  totalVelocity = localVelocity + velocityOffset;
              } else {
                  velocityOffset =
                      rotationByQuaternions(volLocal, worldRotation) + volWorld + inheritedVelocityWorld;
                  totalVelocity = rotationByQuaternions(localVelocity, worldRotation) + velocityOffset;
              }

              float moduleRand = attr.a_Random2.w;
              float effectiveDampen = 1.0 - pow(1.0 - renderer_LVLDampen, dt * 30.0);
              totalVelocity =
                  applyLVLSpeedLimitTF(totalVelocity, normalizedAge, moduleRand, effectiveDampen);

              float drag = evaluateLVLDrag(normalizedAge, moduleRand);
              if (drag > 0.0) {
                  float speedSqr = dot(totalVelocity, totalVelocity);
                  float speed = sqrt(speedSqr);

                  #ifdef RENDERER_LVL_DRAG_MULTIPLY_SIZE
                      float maxDimension = max(attr.a_StartSize.x, max(attr.a_StartSize.y, attr.a_StartSize.z));
                      float radius = maxDimension * 0.5;
                      drag *= 3.14159265 * radius * radius;
                  #endif

                  #ifdef RENDERER_LVL_DRAG_MULTIPLY_VELOCITY
                      drag *= speedSqr;
                  #endif

                  if (speed > 0.0) {
                      totalVelocity *= max(0.0, speed - drag * dt) / speed;
                  }
              }

              if (renderer_LVLSpace == 0) {
                  localVelocity = totalVelocity - velocityOffset;
              } else {
                  localVelocity = rotationByQuaternions(totalVelocity - velocityOffset, invWorldRotation);
              }
          #endif

          // Step 4: Integrate position
          vec3 baseVelocity;
          if (renderer_SimulationSpace == 0) {
            baseVelocity = localVelocity;
          } else {
            baseVelocity = rotationByQuaternions(localVelocity, worldRotation);
          }
          #ifdef RENDERER_NOISE_MODULE_ENABLED
              vec3 noiseBasePos;
              if (renderer_SimulationSpace == 0) {
                  noiseBasePos = attr.a_ShapePositionStartLifeTime.xyz + attr.a_DirectionTime.xyz * attr.a_StartSpeed * simulationAge;
              } else {
                  noiseBasePos = rotationByQuaternions(
                      attr.a_ShapePositionStartLifeTime.xyz + attr.a_DirectionTime.xyz * attr.a_StartSpeed * simulationAge,
                      worldRotation) + simulationWorldPosition;
              }
              baseVelocity += computeNoiseVelocity(attr, noiseBasePos, normalizedAge);
          #endif

          vec3 totalLinearVelocity;
          if (renderer_SimulationSpace == 0) {
              totalLinearVelocity = baseVelocity + volLocal + rotationByQuaternions(volWorld, invWorldRotation);
          } else {
              totalLinearVelocity = baseVelocity + rotationByQuaternions(volLocal, worldRotation) + volWorld;
          }
          if (renderer_SimulationSpace == 0) {
              totalLinearVelocity += rotationByQuaternions(inheritedVelocityWorld, invWorldRotation);
          } else {
              totalLinearVelocity += inheritedVelocityWorld;
          }

          #ifdef _VOL_ORBITAL_RADIAL_MODULE_ENABLED
          {
              vec3 rel;
              if (renderer_SimulationSpace == 0) {
                  rel = position - renderer_VOLOffset;
              } else {
                  rel = rotationByQuaternions(position - simulationWorldPosition, invWorldRotation) - renderer_VOLOffset;
              }

              #if defined(RENDERER_VOL_ORBITAL_CONSTANT_MODE) || defined(RENDERER_VOL_ORBITAL_CURVE_MODE)
                  rel = rotationByEuler(rel, evaluateVOLOrbital(attr, normalizedAge) * dt);
              #endif

              #if defined(RENDERER_VOL_RADIAL_CONSTANT_MODE) || defined(RENDERER_VOL_RADIAL_CURVE_MODE)
                  float relLen = length(rel);
                  if (relLen > 1e-5) {
                      rel += (rel / relLen) * evaluateVOLRadial(attr, normalizedAge) * dt;
                  }
              #endif

              if (renderer_SimulationSpace == 0) {
                  position = renderer_VOLOffset + rel;
              } else {
                  position = simulationWorldPosition + rotationByQuaternions(renderer_VOLOffset + rel, worldRotation);
              }
          }
          #endif
          position += totalLinearVelocity * dt;
      }

      Varyings main(Attributes attr) {
          Varyings v;

          vec3 position = attr.a_FeedbackPosition;
          vec3 localVelocity = attr.a_FeedbackVelocity;
          #ifdef RENDERER_TRAJECTORY_FEEDBACK
              vec3 previousWorldPosition = attr.a_FeedbackWorldPosition;
          #endif

          bool isNewParticle = renderer_FirstNewParticle != renderer_FirstFreeParticle &&
              (renderer_FirstNewParticle < renderer_FirstFreeParticle
                  ? gl_VertexID >= renderer_FirstNewParticle && gl_VertexID < renderer_FirstFreeParticle
                  : gl_VertexID >= renderer_FirstNewParticle || gl_VertexID < renderer_FirstFreeParticle);
          if (isNewParticle) {
              position = attr.a_ShapePositionStartLifeTime.xyz;
              localVelocity = attr.a_DirectionTime.xyz * attr.a_StartSpeed;
              #ifdef RENDERER_HAS_SUB_EMITTER_SPAWNED_PARTICLES
                  if (isSubEmitterSpawnedParticle(attr)) {
                      vec3 parentWorldPosition = reconstructParentWorldPositionAtEmission(attr);
                      vec4 invSimulationWorldRotation = quaternionConjugate(attr.a_SimulationWorldRotation);
                      if (renderer_SimulationSpace == 0) {
                          position += rotationByQuaternions(
                              parentWorldPosition - attr.a_SimulationWorldPosition,
                              invSimulationWorldRotation
                          );
                      } else {
                          position =
                              rotationByQuaternions(position, attr.a_SimulationWorldRotation) +
                              parentWorldPosition;
                      }
                      applyParentTrajectoryToStartVelocity(attr, invSimulationWorldRotation, localVelocity);
                  } else if (renderer_SimulationSpace != 0) {
                      position =
                          rotationByQuaternions(position, attr.a_SimulationWorldRotation) +
                          attr.a_SimulationWorldPosition;
                  }
              #else
                  if (renderer_SimulationSpace != 0) {
                      position =
                          rotationByQuaternions(position, attr.a_SimulationWorldRotation) +
                          attr.a_SimulationWorldPosition;
                  }
              #endif
          }

          #ifdef RENDERER_TRAJECTORY_FEEDBACK
              if (isNewParticle || renderer_ResetTrajectory != 0) {
                  previousWorldPosition = getParticleWorldPosition(position);
              }
          #endif

          float lifetime = attr.a_ShapePositionStartLifeTime.w;
          float age = renderer_CurrentTime - attr.a_DirectionTime.w;
          float simulationAge = min(age, lifetime);
          // Existing particles consume this frame's delta; new particles simulate from their emission time
          float previousAge = isNewParticle ? 0.0 : max(age - renderer_DeltaTime, 0.0);
          float simulationDuration = max(simulationAge - previousAge, 0.0);
          if (simulationDuration <= 0.0) {
              v.v_FeedbackPosition = position;
              v.v_FeedbackVelocity = localVelocity;
              #ifdef RENDERER_TRAJECTORY_FEEDBACK
                  v.v_FeedbackWorldPosition = previousWorldPosition;
                  v.v_FeedbackTrajectoryVelocity = vec3(0.0);
              #endif
              gl_Position = vec4(0.0);
              return v;
          }

          vec4 worldRotation;
          if (renderer_SimulationSpace == 0) {
              worldRotation = renderer_WorldRotation;
          } else {
              worldRotation = attr.a_SimulationWorldRotation;
          }
          vec4 invWorldRotation = quaternionConjugate(worldRotation);

          simulateParticleStep(
              attr,
              previousAge,
              simulationAge,
              lifetime,
              worldRotation,
              invWorldRotation,
              position,
              localVelocity
          );

          v.v_FeedbackPosition = position;
          v.v_FeedbackVelocity = localVelocity;
          #ifdef RENDERER_TRAJECTORY_FEEDBACK
              vec3 worldPosition = getParticleWorldPosition(position);
              v.v_FeedbackWorldPosition = worldPosition;
              v.v_FeedbackTrajectoryVelocity = (worldPosition - previousWorldPosition) / simulationDuration;
          #endif
          gl_Position = vec4(0.0);
          return v;
      }

      void frag(Varyings v) {
          discard;
      }
    }

    Pass "SubEmitterTrajectoryGather" {
      Tags { pipelineStage = "TransformFeedback" }

      VertexShader = gatherTrajectory;
      FragmentShader = gatherTrajectoryFrag;

      struct Attributes {
          vec3 a_FeedbackWorldPosition;
          vec3 a_FeedbackTrajectoryVelocity;
      };

      struct Varyings {
          vec3 v_ParentSampleWorldPosition;
          vec3 v_ParentTrajectoryVelocity;
      };

      Varyings gatherTrajectory(Attributes attr) {
          Varyings v;
          v.v_ParentSampleWorldPosition = attr.a_FeedbackWorldPosition;
          v.v_ParentTrajectoryVelocity = attr.a_FeedbackTrajectoryVelocity;
          gl_Position = vec4(0.0);
          return v;
      }

      void gatherTrajectoryFrag(Varyings v) {
          discard;
      }
    }

  }
}
