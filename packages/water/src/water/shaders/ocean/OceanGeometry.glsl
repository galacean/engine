#ifndef WATER_OCEAN_GEOMETRY_INCLUDED
#define WATER_OCEAN_GEOMETRY_INCLUDED

      float oceanMaximum4(vec4 value) {
        return max(max(value.x, value.y), max(value.z, value.w));
      }

      vec4 oceanGeometryWaveWavelength(vec4 frequency) {
        const float twoPi = 6.283185307179586;
        return vec4(twoPi) / max(frequency, vec4(0.0001));
      }

      vec4 oceanGeometryWaveGridWeight(vec4 wavelength, float samplingCellSize) {
        vec4 samplesPerWavelength = wavelength / max(samplingCellSize, 0.0001);
        return smoothstep(
          vec4({{MINIMUM_SAMPLES_PER_WAVELENGTH}}),
          vec4({{FULL_SAMPLES_PER_WAVELENGTH}}),
          samplesPerWavelength
        );
      }

      vec4 oceanGeometryWaveViewWeight(
        vec4 wavelength,
        vec4 directionAB,
        vec4 directionCD,
        float viewDistance,
        vec3 viewDirection,
        float projectedPixelsPerMetre,
        float grazingWeight
      ) {
        vec4 waveViewAlignment = abs(vec4(
          dot(directionAB.xy, viewDirection.xz),
          dot(directionAB.zw, viewDirection.xz),
          dot(directionCD.xy, viewDirection.xz),
          dot(directionCD.zw, viewDirection.xz)
        ));
        vec4 projectedDirectionScale = sqrt(max(
          vec4(1.0) - waveViewAlignment * waveViewAlignment,
          vec4(0.0)
        ));
        vec4 projectedPixelsPerWavelength = wavelength
          * projectedPixelsPerMetre
          * projectedDirectionScale;
        vec4 projectedPixelWeight = smoothstep(
          vec4({{MINIMUM_PROJECTED_PIXELS_PER_WAVELENGTH}}),
          vec4({{FULL_PROJECTED_PIXELS_PER_WAVELENGTH}}),
          projectedPixelsPerWavelength
        );
        vec4 viewDistanceWavelengths = vec4(viewDistance) / wavelength;
        vec4 distanceWeight = vec4(1.0) - smoothstep(
          vec4({{DISTANCE_FADE_START_WAVELENGTHS}}),
          vec4({{DISTANCE_FADE_END_WAVELENGTHS}}),
          viewDistanceWavelengths
        );
        return projectedPixelWeight * distanceWeight * grazingWeight;
      }

      void applyWaveGroup(
        vec2 restXZ,
        vec4 amplitude,
        vec4 frequency,
        vec4 phase,
        vec4 steepness,
        vec4 directionAB,
        vec4 directionCD,
        vec4 waveBandlimitWeight,
        inout vec3 offset,
        inout vec3 normalSum
      ) {
        vec4 weightedAmplitude = amplitude * waveBandlimitWeight;
        float maximumAmplitude = max(
          max(abs(weightedAmplitude.x), abs(weightedAmplitude.y)),
          max(abs(weightedAmplitude.z), abs(weightedAmplitude.w))
        );
        if (maximumAmplitude > {{MINIMUM_DISPLACEMENT_AMPLITUDE_METRES}}) {
          vec4 angles = frequency * vec4(
            dot(directionAB.xy, restXZ),
            dot(directionAB.zw, restXZ),
            dot(directionCD.xy, restXZ),
            dot(directionCD.zw, restXZ)
          ) + phase;
          vec4 cosine = cos(angles);
          vec4 sine = sin(angles);
          vec4 horizontalAB = steepness.xxyy * directionAB * weightedAmplitude.xxyy;
          vec4 horizontalCD = steepness.zzww * directionCD * weightedAmplitude.zzww;
          offset += vec3(
            dot(cosine, vec4(horizontalAB.xz, horizontalCD.xz)),
            dot(sine, weightedAmplitude),
            dot(cosine, vec4(horizontalAB.yw, horizontalCD.yw))
          );

          vec4 normalAB = frequency.xxyy * weightedAmplitude.xxyy * directionAB;
          vec4 normalCD = frequency.zzww * weightedAmplitude.zzww * directionCD;
          vec3 groupNormal = vec3(0.0, 2.0, 0.0);
          groupNormal.x -= dot(cosine, vec4(normalAB.xz, normalCD.xz));
          groupNormal.z -= dot(cosine, vec4(normalAB.yw, normalCD.yw));
          // Keep the geometry normal independent of artistic shading strength.
          normalSum += normalize(groupNormal);
        }
      }

#endif
