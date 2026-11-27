Shader "Effect/ParticleFeedback" {
  SubShader "Default" {
    Pass "TransformFeedback" {
      Tags { pipelineStage = "TransformFeedback" }

      VertexShader = main;
      FragmentShader = frag;

      #include "ShaderLibrary/Particle/ParticleFeedbackCore.glsl"

      struct Varyings {
          vec3 v_FeedbackPosition;
          vec3 v_FeedbackVelocity;
          #ifdef RENDERER_TRAJECTORY_FEEDBACK
              vec3 v_FeedbackWorldPosition;
              vec3 v_FeedbackTrajectoryVelocity;
          #endif
      };

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
              localVelocity = attr.a_DirectionTime.xyz * attr.a_StartSizeSpeed.w;
              #ifdef RENDERER_HAS_SUB_EMITTER_SPAWNED_PARTICLES
                  if (isSubEmitterSpawnedParticle(attr)) {
                      vec3 parentWorldPosition = reconstructParentWorldPositionAtEmission(attr);
                      vec4 invSimulationWorldRotation = quaternionConjugate(attr.a_SimulationWorldRotation);
                      if (renderer_SimulationSpace == 0) {
                          position += rotationByQuaternions(
                              parentWorldPosition - attr.a_WorldPositionGravity.xyz,
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
                          attr.a_WorldPositionGravity.xyz;
                  }
              #else
                  if (renderer_SimulationSpace != 0) {
                      position =
                          rotationByQuaternions(position, attr.a_SimulationWorldRotation) +
                          attr.a_WorldPositionGravity.xyz;
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

          simulateParticleStep(
              attr,
              previousAge,
              simulationAge,
              lifetime,
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
