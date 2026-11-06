#ifndef WATER_HEIGHTFIELD_RAIN_RIPPLE_LOW_STATEMENTS_INCLUDED
#define WATER_HEIGHTFIELD_RAIN_RIPPLE_LOW_STATEMENTS_INCLUDED

        float rainRate = clamp(scene_WeatherState.x, 0.0, 1.0)
          * material_MicroNormalsEnabled;
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
        float rainRipplePlaybackStrength = smoothstep(0.04, 0.72, rainRate);
        float rainRippleRainAmount = smoothstep(0.02, 1.0, rainRate);
        float rainRippleStormAmount = smoothstep(0.68, 1.0, rainRate);
        float rainRippleRainPresence = step(0.0001, rainRate);
        float rainRippleRingAmplitude = mix(0.82, 1.0, rainRippleStormAmount);
        float rainRippleVisibility = rainRippleRainPresence
          * rainRippleUpwardFade
          * rainRippleDistanceFade;
        float rainRippleContribution = rainRippleVisibility
          * rainRippleRingAmplitude;
        float rainRippleMask = 0.0;
        if (rainRippleContribution > 0.001) {
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
