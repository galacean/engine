
Shader "Lighting/WindGpuTreeResponse" {
  SubShader "Default" {
    Pass "Response" {
      DepthState = { Enabled = false; WriteEnabled = false; }
      RasterState = { CullMode = CullMode.Off; }
      VertexShader = vert;
      FragmentShader = frag;
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Blit/BlitVertex.glsl"

      mediump sampler2D renderer_BlitTexture;
      mediump sampler2D material_PreviousLocalFieldTexture;
      mediump sampler2D material_CurrentLocalFieldTexture;
      mediump sampler2D material_ExposureTexture;
      mediump sampler2D material_PreviousExposureTexture;
      vec4 material_PreviousWindVelocity;
      vec4 material_CurrentWindVelocity;
      vec4 material_ResponseParams;
      vec4 material_ResponseHistoryTransform;
      float material_DeltaTime;
      float material_RampDuration;
      float material_ResetHistory;

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

      vec2 windTreePressureTarget(vec4 localField, float exposure, vec2 meanVelocity) {
        // A already stores gust * exposure. Add it beside the sheltered mean term; multiplying
        // the complete parenthesis by exposure would shelter the travelling packet twice.
        vec2 velocity = meanVelocity * (exposure + max(localField.a, 0.0)) + localField.rg;
        float speed = length(velocity);
        if (speed <= 0.0001) return vec2(0.0);
        // Dynamic pressure is normalized at 8 m/s. The response is intentionally not clamped:
        // the species-owned compliant bend limit maps gale load to finite angular travel later.
        return velocity / speed * (speed * speed / 64.0);
      }

      float windTreeLocalFieldWeight(vec2 uv) {
        vec2 edgeDistance = min(uv, vec2(1.0) - uv);
        return smoothstep(0.0, 0.04, min(edgeDistance.x, edgeDistance.y));
      }

      void frag(Varyings input) {
        vec2 previousUv = input.v_uv + material_ResponseHistoryTransform.xy;
        float historyInside = step(0.0, previousUv.x) * step(0.0, previousUv.y) *
          step(previousUv.x, 1.0) * step(previousUv.y, 1.0);
        float exposure = texture2D(material_ExposureTexture, input.v_uv).r;
        vec4 currentField = texture2D(material_CurrentLocalFieldTexture, input.v_uv);
        vec2 currentLocalTarget = windTreePressureTarget(
          currentField,
          exposure,
          material_CurrentWindVelocity.xy
        );
        vec2 currentGlobalTarget = windTreePressureTarget(
          vec4(0.0),
          1.0,
          material_CurrentWindVelocity.xy
        );
        vec2 currentTarget = mix(
          currentGlobalTarget,
          currentLocalTarget,
          windTreeLocalFieldWeight(input.v_uv)
        );
        if (material_ResetHistory > 0.5 || historyInside < 0.5) {
          gl_FragColor = vec4(currentTarget, 0.0, 0.0);
        } else {
          vec4 previousState = texture2D(renderer_BlitTexture, previousUv);
          vec4 previousField = texture2D(material_PreviousLocalFieldTexture, previousUv);
          float previousExposure = texture2D(material_PreviousExposureTexture, previousUv).r;
          vec2 previousLocalTarget = windTreePressureTarget(
            previousField,
            previousExposure,
            material_PreviousWindVelocity.xy
          );
          vec2 previousGlobalTarget = windTreePressureTarget(
            vec4(0.0),
            1.0,
            material_PreviousWindVelocity.xy
          );
          vec2 previousTarget = mix(
            previousGlobalTarget,
            previousLocalTarget,
            windTreeLocalFieldWeight(previousUv)
          );
          vec2 responseX = windAdvanceDampedRampResponse(
            vec2(previousState.x, previousState.z),
            previousTarget.x,
            currentTarget.x,
            material_ResponseParams.x,
            material_ResponseParams.y,
            material_RampDuration,
            material_DeltaTime
          );
          vec2 responseZ = windAdvanceDampedRampResponse(
            vec2(previousState.y, previousState.w),
            previousTarget.y,
            currentTarget.y,
            material_ResponseParams.x,
            material_ResponseParams.y,
            material_RampDuration,
            material_DeltaTime
          );
          gl_FragColor = vec4(responseX.x, responseZ.x, responseX.y, responseZ.y);
        }
      }
    }
  }
}
