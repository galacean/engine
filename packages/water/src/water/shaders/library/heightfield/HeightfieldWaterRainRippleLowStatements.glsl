#ifndef WATER_HEIGHTFIELD_RAIN_RIPPLE_LOW_STATEMENTS_INCLUDED
#define WATER_HEIGHTFIELD_RAIN_RIPPLE_LOW_STATEMENTS_INCLUDED

#ifdef SCENE_SURFACE_CLIMATE_DRY
        float rainRippleSurfaceRoughness = clamp(material_Roughness, 0.0, 1.0);
#else
        float rainRate = clamp(scene_WeatherState.x, 0.0, 1.0)
          * material_MicroNormalsEnabled;
        float rainRippleMask = 0.0;
        float rainRippleStormAmount = 0.0;
        if (rainRate > 0.0001) {
          float rainRippleUpwardCosine = clamp(input.macroNormalWS.y, 0.0, 1.0);
          float rainRippleUpwardFade = rainRippleUpwardCosine * smoothstep(
            0.2,
            0.55,
            rainRippleUpwardCosine
          );
          vec3 rainRippleCameraDelta = camera_Position - input.worldPosition;
          float rainRippleHorizontalDistance = length(rainRippleCameraDelta.xz);
          float rainRippleVerticalDistance = abs(rainRippleCameraDelta.y);
          float rainRippleDistance =
            rainRippleHorizontalDistance + rainRippleVerticalDistance * 0.25;
          float rainRippleDistanceFade = 1.0 - smoothstep(
            42.0,
            150.0,
            rainRippleDistance
          );
          rainRippleStormAmount = smoothstep(0.68, 1.0, rainRate);
          float rainRippleRingAmplitude = mix(0.82, 1.0, rainRippleStormAmount);
          float rainRippleContribution = rainRippleUpwardFade
            * rainRippleDistanceFade
            * rainRippleRingAmplitude;
          if (rainRippleContribution > 0.001) {
            float rainRipplePlaybackStrength = smoothstep(0.04, 0.72, rainRate);
            float rainRippleRainAmount = smoothstep(0.02, 1.0, rainRate);
            vec2 rainRipplePrimarySample = rainRippleField(
              baseWorldPosition.xz * 0.68,
              scene_WeatherTime,
              0.0,
              rainRipplePlaybackStrength
            );
            float rainRipplePrimaryDensity = rainRippleDensityWeight(
              rainRipplePrimarySample,
              rainRippleRainAmount
            );
            vec2 rainRippleSlope = rainRipplePrimarySample
              * (0.28 * rainRipplePrimaryDensity);
            float rainRippleRawMask = length(rainRipplePrimarySample)
              * rainRipplePrimaryDensity;
            rainRippleMask = smoothstep(0.035, 0.24, rainRippleRawMask)
              * clamp(rainRippleContribution, 0.0, 1.0);
            surfaceNormalWS = rainRippleApplyNormal(
              surfaceNormalWS,
              input.macroNormalWS,
              rainRippleSlope * rainRippleContribution
            );
          }
        }
        float rainRippleRoughnessResponse = mix(
          -0.018,
          0.08,
          rainRippleStormAmount
        );
        float rainRippleRoughnessFloor = max(
          material_Roughness * 0.88,
          material_Roughness - 0.02
        );
        float rainRippleSurfaceRoughness = clamp(
          material_Roughness + rainRippleMask * rainRippleRoughnessResponse,
          rainRippleRoughnessFloor,
          1.0
        );
#endif

#endif
