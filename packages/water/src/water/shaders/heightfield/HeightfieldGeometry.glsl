      vec3 waterWindVelocity() {
        return mix(
          scene_WindVelocity,
          material_WindVelocity,
          clamp(material_WindVelocityOverride, 0.0, 1.0)
        );
      }

      float surfaceTime() {
        float selected = material_SurfaceTimeOverride >= 0.0
          ? material_SurfaceTimeOverride
          : scene_ElapsedTime.x;
        return mod(max(selected, 0.0), {{TIME_PERIOD_SECONDS}});
      }

      vec2 safeNormalize2(vec2 value, vec2 fallbackValue) {
        float lengthSquared = dot(value, value);
        return lengthSquared > 0.000001 ? value * inversesqrt(lengthSquared) : fallbackValue;
      }

      vec3 safeNormalize3(vec3 value, vec3 fallbackValue) {
        float lengthSquared = dot(value, value);
        return lengthSquared > 0.000001 ? value * inversesqrt(lengthSquared) : fallbackValue;
      }

      vec4 sampleFlowSurface(
        vec2 worldXZ,
        vec2 flowDirection,
        float flowSpeed,
        float elapsedTime,
        float scale,
        float rate,
        vec2 layerOffset,
        vec2 cycleJump,
        vec2 spatialPhaseDirection
      ) {
        float flowWeight = smoothstep(
          {{MINIMUM_FLOW_SPEED}},
          {{FLOW_WEIGHT_MAXIMUM_SPEED}},
          flowSpeed
        );
        float normalizedSpeed = saturate(flowSpeed / {{MAXIMUM_FLOW_SPEED}});
        float cycleRate = {{PHASE_RATE}} * rate
          * mix(
            {{STILL_CYCLE_RATE_SCALE}},
            {{FLOWING_CYCLE_RATE_BASE}} + normalizedSpeed * {{FLOWING_CYCLE_RATE_SPEED_SCALE}},
            flowWeight
          );
        float spatialPhase = dot(worldXZ, spatialPhaseDirection);
        float cycle = elapsedTime * cycleRate + spatialPhase;
        float progressA = fract(cycle);
        float progressB = fract(cycle + 0.5);
        float weightA = 1.0 - abs(progressA * 2.0 - 1.0);
        float weightB = 1.0 - abs(progressB * 2.0 - 1.0);
        float travel = {{PHASE_TRAVEL}}
          * mix(
            {{STILL_PHASE_TRAVEL_SCALE}},
            {{FLOWING_PHASE_TRAVEL_BASE}} + normalizedSpeed * {{FLOWING_PHASE_TRAVEL_SPEED_SCALE}},
            flowWeight
          );
        vec2 baseUv = worldXZ * scale + layerOffset;
        vec4 sampleA = texture2D(
          material_SurfaceTexture,
          baseUv
            - flowDirection * ((progressA - 0.5) * travel)
            + (cycle - progressA) * cycleJump
        );
        vec4 sampleB = texture2D(
          material_SurfaceTexture,
          baseUv
            - flowDirection * ((progressB - 0.5) * travel)
            + vec2({{PHASE_B_OFFSET_X}}, {{PHASE_B_OFFSET_Y}})
            + (cycle - progressB) * cycleJump
        );
        vec4 decodedA = vec4(sampleA.rg * 2.0 - 1.0, sampleA.ba);
        vec4 decodedB = vec4(sampleB.rg * 2.0 - 1.0, sampleB.ba);
        return (decodedA * weightA + decodedB * weightB) / max(weightA + weightB, 0.001);
      }

      void applyHeightfieldWave(
        vec4 waveA,
        vec4 waveB,
        vec2 restXZ,
        vec3 tangentWS,
        vec3 bitangentWS,
        vec2 localFlowDirection,
        float flowAlignment,
        float macroAmplitudeScale,
        float shoreDamping,
        inout float displacement,
        inout float tangentSlope,
        inout float bitangentSlope
      ) {
        vec2 tangentXZ = safeNormalize2(tangentWS.xz, vec2(1.0, 0.0));
        vec2 authoredDirection = safeNormalize2(waveA.xy, tangentXZ);
        vec2 localWaveDirection = safeNormalize2(
          mix(authoredDirection, localFlowDirection, flowAlignment),
          authoredDirection
        );
        vec2 waveDirection = waterLocalDirectionToWorldXZ(localWaveDirection);
        float theta = waveA.w * dot(localWaveDirection, restXZ) - 6.28318531 * waveB.y + waveB.z;
        float amplitude = waveA.z
          * material_WaveStrength
          * material_WavesEnabled
          * macroAmplitudeScale;
        float sine = sin(theta);
        float cosine = cos(theta);
        float slope = amplitude * waveA.w * cosine * shoreDamping;
        displacement += amplitude * sine * shoreDamping;
        tangentSlope += slope * dot(waveDirection, tangentWS.xz);
        bitangentSlope += slope * dot(waveDirection, bitangentWS.xz);
      }
