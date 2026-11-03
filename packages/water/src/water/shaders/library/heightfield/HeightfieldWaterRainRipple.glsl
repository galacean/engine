#ifndef WATER_HEIGHTFIELD_RAIN_RIPPLE_INCLUDED
#define WATER_HEIGHTFIELD_RAIN_RIPPLE_INCLUDED

      vec4 scene_WeatherState;
      float scene_WeatherTime;
      sampler2D scene_SurfaceRippleNormalAtlas;

      vec3 rainRippleSafeNormalize3(vec3 value, vec3 fallbackValue) {
        float lengthSquared = dot(value, value);
        return lengthSquared > 0.000001 ? value * inversesqrt(lengthSquared) : fallbackValue;
      }

      vec3 rainRippleDecodeNormal(vec3 encodedNormal) {
        vec3 normal = encodedNormal * 2.0 - 1.0;
        return rainRippleSafeNormalize3(vec3(normal.xy, max(normal.z, 0.08)), vec3(0.0, 0.0, 1.0));
      }

      vec3 rainRippleSampleFrame(vec2 localUv, float frame) {
        vec2 frameCell = vec2(mod(frame, 8.0), floor(frame * 0.125));
        vec2 frameUv = (
          frameCell + mix(vec2(0.04), vec2(0.96), clamp(localUv, 0.0, 1.0))
        ) * 0.125;
        return rainRippleDecodeNormal(
          texture2D(scene_SurfaceRippleNormalAtlas, frameUv).xyz
        );
      }

      vec2 rainRippleField(
        vec2 fieldUv,
        float weatherTime,
        float frameOffset,
        float rainStrength
      ) {
        float frameRate = mix(8.0, 24.0, clamp(rainStrength, 0.0, 1.0));
        float frame = floor(mod(weatherTime * frameRate + frameOffset, 64.0));
        return rainRippleSampleFrame(fract(fieldUv), frame).xy;
      }

      float rainRippleDensityWeight(vec2 rippleSlope, float rainAmount) {
        float minimumSlope = mix(0.14, 0.025, rainAmount);
        float feather = mix(0.07, 0.025, rainAmount);
        return smoothstep(
          minimumSlope,
          minimumSlope + feather,
          length(rippleSlope)
        );
      }

      vec3 rainRippleApplyNormal(
        vec3 surfaceNormalWS,
        vec3 macroNormalWS,
        vec2 rippleSlope
      ) {
        vec3 worldRippleSlope = vec3(rippleSlope.x, 0.0, rippleSlope.y);
        vec3 tangentRippleSlope = worldRippleSlope
          - macroNormalWS * dot(worldRippleSlope, macroNormalWS);
        return rainRippleSafeNormalize3(surfaceNormalWS + tangentRippleSlope, macroNormalWS);
      }

#endif
