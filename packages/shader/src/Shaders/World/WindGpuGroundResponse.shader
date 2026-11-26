
Shader "Lighting/WindGpuGroundResponse" {
  SubShader "Default" {
    Pass "Response" {
      DepthState = { Enabled = false; WriteEnabled = false; }
      RasterState = { CullMode = CullMode.Off; }
      VertexShader = vert;
      FragmentShader = frag;
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Blit/BlitVertex.glsl"

      mediump sampler2D renderer_BlitTexture;
      mediump sampler2D material_OlderLocalFieldTexture;
      mediump sampler2D material_PreviousLocalFieldTexture;
      mediump sampler2D material_CurrentLocalFieldTexture;
      vec4 material_ResponseParams;
      vec4 material_GroundReferenceGustHistory;
      vec4 material_ResponseHistoryTransform;
      vec4 material_OlderFieldHistoryTransform;
      float material_DeltaTime;
      float material_RampDuration;
      float material_ResetHistory;

      float windGroundLocalFieldWeight(vec2 uv) {
        vec2 edgeDistance = min(uv, vec2(1.0) - uv);
        return smoothstep(0.0, 0.04, min(edgeDistance.x, edgeDistance.y));
      }

      vec2 windAdvanceDampedResponse(
        vec2 state,
        float target,
        float frequencyHz,
        float dampingRatio,
        float elapsedSeconds
      ) {
        float omega = max(frequencyHz, 0.001) * 6.2831853;
        float error = state.x - target;
        if (dampingRatio >= 0.9999) {
          float coefficient = state.y + omega * error;
          float decay = exp(-omega * elapsedSeconds);
          return vec2(
            target + (error + coefficient * elapsedSeconds) * decay,
            (state.y - omega * coefficient * elapsedSeconds) * decay
          );
        }
        float boundedDamping = clamp(dampingRatio, 0.001, 0.9999);
        float dampedOmega = omega * sqrt(max(1.0 - boundedDamping * boundedDamping, 0.000001));
        float decay = exp(-boundedDamping * omega * elapsedSeconds);
        float cosine = cos(dampedOmega * elapsedSeconds);
        float sine = sin(dampedOmega * elapsedSeconds);
        float sineCoefficient = (state.y + boundedDamping * omega * error) / dampedOmega;
        float oscillation = error * cosine + sineCoefficient * sine;
        return vec2(
          target + decay * oscillation,
          decay * (
            -boundedDamping * omega * oscillation -
            error * dampedOmega * sine +
            sineCoefficient * dampedOmega * cosine
          )
        );
      }

      vec2 windAdvanceDampedRampResponse(
        vec2 state,
        float startTarget,
        float endTarget,
        float frequencyHz,
        float dampingRatio,
        float rampDurationSeconds,
        float elapsedSeconds
      ) {
        float deltaTime = max(elapsedSeconds, 0.0);
        if (deltaTime <= 0.0) return state;
        float rampDuration = max(rampDurationSeconds, 0.0001);
        float rampTime = min(deltaTime, rampDuration);
        float omega = max(frequencyHz, 0.001) * 6.2831853;
        float boundedDamping = clamp(dampingRatio, 0.001, 1.0);
        float slope = (endTarget - startTarget) / rampDuration;
        float steadyVelocityOffset = 2.0 * boundedDamping * slope / omega;
        vec2 homogeneous = windAdvanceDampedResponse(
          vec2(state.x - startTarget + steadyVelocityOffset, state.y - slope),
          0.0,
          frequencyHz,
          boundedDamping,
          rampTime
        );
        vec2 response = vec2(
          startTarget + slope * rampTime - steadyVelocityOffset + homogeneous.x,
          slope + homogeneous.y
        );
        if (deltaTime > rampDuration) {
          response = windAdvanceDampedResponse(
            response,
            endTarget,
            frequencyHz,
            boundedDamping,
            deltaTime - rampDuration
          );
        }
        return response;
      }

      void frag(Varyings input) {
        float currentTarget = mix(
          material_GroundReferenceGustHistory.z,
          texture2D(material_CurrentLocalFieldTexture, input.v_uv).a,
          windGroundLocalFieldWeight(input.v_uv)
        );
        vec2 previousUv = input.v_uv + material_ResponseHistoryTransform.xy;
        vec2 olderUv = input.v_uv + material_OlderFieldHistoryTransform.xy;
        float historyInside = step(0.0, previousUv.x) * step(0.0, previousUv.y) *
          step(previousUv.x, 1.0) * step(previousUv.y, 1.0);
        historyInside *= step(0.0, olderUv.x) * step(0.0, olderUv.y) *
          step(olderUv.x, 1.0) * step(olderUv.y, 1.0);
        if (material_ResetHistory > 0.5 || historyInside < 0.5) {
          gl_FragColor = vec4(currentTarget, 0.0, currentTarget, 0.0);
        } else {
          vec4 previousState = texture2D(renderer_BlitTexture, previousUv);
          float olderTarget = mix(
            material_GroundReferenceGustHistory.x,
            texture2D(material_OlderLocalFieldTexture, olderUv).a,
            windGroundLocalFieldWeight(olderUv)
          );
          float previousTarget = mix(
            material_GroundReferenceGustHistory.y,
            texture2D(material_PreviousLocalFieldTexture, previousUv).a,
            windGroundLocalFieldWeight(previousUv)
          );
          vec2 lowResponse = windAdvanceDampedRampResponse(
            previousState.xy,
            olderTarget,
            previousTarget,
            material_ResponseParams.x,
            material_ResponseParams.y,
            material_RampDuration,
            material_DeltaTime
          );
          vec2 highResponse = windAdvanceDampedRampResponse(
            previousState.zw,
            olderTarget,
            previousTarget,
            material_ResponseParams.z,
            material_ResponseParams.w,
            material_RampDuration,
            material_DeltaTime
          );
          gl_FragColor = vec4(lowResponse, highResponse);
        }
      }
    }
  }
}
