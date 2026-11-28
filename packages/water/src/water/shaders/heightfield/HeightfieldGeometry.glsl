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
