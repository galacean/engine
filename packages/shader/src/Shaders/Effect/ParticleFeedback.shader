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

      #ifdef RENDERER_INHERIT_VELOCITY_CURRENT
          vec3 renderer_InheritVelocity;
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
      #endif

      struct Attributes {
          vec3 a_FeedbackPosition;
          vec3 a_FeedbackVelocity;
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

          #ifdef RENDERER_INHERIT_VELOCITY_RANDOM
              float a_InheritVelocityRandom;
          #endif
      };

      struct Varyings {
          vec3 v_FeedbackPosition;
          vec3 v_FeedbackVelocity;
      };

      // Module includes (after Attributes/Varyings)
      #include "ShaderLibrary/Particle/ParticleCommon.glsl"
      #include "ShaderLibrary/Particle/Module/VelocityOverLifetime.glsl"
      #include "ShaderLibrary/Particle/Module/ForceOverLifetime.glsl"
      #include "ShaderLibrary/Particle/Module/LimitVelocityOverLifetime.glsl"
      #include "ShaderLibrary/Particle/Module/NoiseModule.glsl"

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

      Varyings main(Attributes attr) {
          Varyings v;

          float lifetime = attr.a_ShapePositionStartLifeTime.w;
          float age = renderer_CurrentTime - attr.a_DirectionTime.w;

          if (lifetime <= 0.0 || age <= 0.0) {
              v.v_FeedbackPosition = attr.a_FeedbackPosition;
              v.v_FeedbackVelocity = attr.a_FeedbackVelocity;
              gl_Position = vec4(0.0);
              return v;
          }

          float simulationAge = min(age, lifetime);
          float previousAge = max(age - renderer_DeltaTime, 0.0);
          float dt = max(simulationAge - previousAge, 0.0);
          if (dt <= 0.0) {
              v.v_FeedbackPosition = attr.a_FeedbackPosition;
              v.v_FeedbackVelocity = attr.a_FeedbackVelocity;
              gl_Position = vec4(0.0);
              return v;
          }
          float normalizedAge = simulationAge / lifetime;

          vec4 worldRotation;
          if (renderer_SimulationSpace == 0) {
              worldRotation = renderer_WorldRotation;
          } else {
              worldRotation = attr.a_SimulationWorldRotation;
          }
          vec4 invWorldRotation = quaternionConjugate(worldRotation);

          vec3 localVelocity = attr.a_FeedbackVelocity;
          vec3 inheritedVelocityWorld = vec3(0.0);

          #ifdef RENDERER_INHERIT_VELOCITY_CURRENT
              float inheritFactor;
              #ifdef RENDERER_INHERIT_VELOCITY_CONSTANT_MODE
                  inheritFactor = renderer_InheritVelocityMaxConst;
                  #ifdef RENDERER_INHERIT_VELOCITY_RANDOM
                      inheritFactor = mix(renderer_InheritVelocityMinConst, inheritFactor, attr.a_InheritVelocityRandom);
                  #endif
              #endif
              #ifdef RENDERER_INHERIT_VELOCITY_CURVE_MODE
                  inheritFactor = evaluateParticleCurve(renderer_InheritVelocityMaxCurve, normalizedAge);
                  #ifdef RENDERER_INHERIT_VELOCITY_RANDOM
                      inheritFactor = mix(
                          evaluateParticleCurve(renderer_InheritVelocityMinCurve, normalizedAge),
                          inheritFactor,
                          attr.a_InheritVelocityRandom);
                  #endif
              #endif
              inheritedVelocityWorld = renderer_InheritVelocity * inheritFactor;
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
              vec3 volAsLocal = volLocal + rotationByQuaternions(volWorld, invWorldRotation);
              vec3 volAsWorld = rotationByQuaternions(volLocal, worldRotation) + volWorld;
              vec3 inheritedVelocityLocal = rotationByQuaternions(inheritedVelocityWorld, invWorldRotation);

              float limitRand = attr.a_Random2.w;
              float dampen = renderer_LVLDampen;
              float effectiveDampen = 1.0 - pow(1.0 - dampen, dt * 30.0);

              if (renderer_LVLSpace == 0) {
                  vec3 totalLocal = localVelocity + volAsLocal + inheritedVelocityLocal;
                  vec3 dampenedTotal = applyLVLSpeedLimitTF(totalLocal, normalizedAge, limitRand, effectiveDampen);
                  localVelocity = dampenedTotal - volAsLocal - inheritedVelocityLocal;
              } else {
                  vec3 totalWorld = rotationByQuaternions(localVelocity, worldRotation) + volAsWorld + inheritedVelocityWorld;
                  vec3 dampenedTotal = applyLVLSpeedLimitTF(totalWorld, normalizedAge, limitRand, effectiveDampen);
                  localVelocity = rotationByQuaternions(dampenedTotal - volAsWorld - inheritedVelocityWorld, invWorldRotation);
              }

              {
                  float dragCoeff = evaluateLVLDrag(normalizedAge, attr.a_Random2.w);
                  if (dragCoeff > 0.0) {
                      vec3 totalVel;
                      if (renderer_LVLSpace == 0) {
                          totalVel = localVelocity + volAsLocal + inheritedVelocityLocal;
                      } else {
                          totalVel = rotationByQuaternions(localVelocity, worldRotation) + volAsWorld + inheritedVelocityWorld;
                      }
                      float velMagSqr = dot(totalVel, totalVel);
                      float velMag = sqrt(velMagSqr);

                      float drag = dragCoeff;

                      #ifdef RENDERER_LVL_DRAG_MULTIPLY_SIZE
                          float maxDim = max(attr.a_StartSize.x, max(attr.a_StartSize.y, attr.a_StartSize.z));
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
                              localVelocity = draggedTotal - volAsLocal - inheritedVelocityLocal;
                          } else {
                              localVelocity = rotationByQuaternions(
                                  draggedTotal - volAsWorld - inheritedVelocityWorld,
                                  invWorldRotation);
                          }
                      }
                  }
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
                      worldRotation) + attr.a_SimulationWorldPosition;
              }
              baseVelocity += computeNoiseVelocity(attr, noiseBasePos, normalizedAge);
          #endif

          vec3 totalLinearVelocity;
          if (renderer_SimulationSpace == 0) {
              totalLinearVelocity = baseVelocity + volLocal + rotationByQuaternions(volWorld, invWorldRotation);
          } else {
              totalLinearVelocity = baseVelocity + rotationByQuaternions(volLocal, worldRotation) + volWorld;
          }
          totalLinearVelocity += inheritedVelocityWorld;

          #ifdef _VOL_ORBITAL_RADIAL_MODULE_ENABLED
          vec3 position = attr.a_FeedbackPosition;

          {
              vec3 rel;
              if (renderer_SimulationSpace == 0) {
                  rel = position - renderer_VOLOffset;
              } else {
                  rel = rotationByQuaternions(position - attr.a_SimulationWorldPosition, invWorldRotation) - renderer_VOLOffset;
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
                  position = attr.a_SimulationWorldPosition + rotationByQuaternions(renderer_VOLOffset + rel, worldRotation);
              }
          }
          position += totalLinearVelocity * dt;
          #else
          vec3 position = attr.a_FeedbackPosition + totalLinearVelocity * dt;
          #endif

          v.v_FeedbackPosition = position;
          v.v_FeedbackVelocity = localVelocity;
          gl_Position = vec4(0.0);
          return v;
      }

      void frag(Varyings v) {
          discard;
      }
    }
  }
}
