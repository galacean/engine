#ifndef WATER_OCEAN_SURFACE_DETAIL_{{SECTION}}_INCLUDED
#define WATER_OCEAN_SURFACE_DETAIL_{{SECTION}}_INCLUDED

#if {{SECTION}} == 0
      vec3 decodeNormalMap(vec3 encoded) {
        return safeNormalize3(encoded * 2.0 - 1.0, vec3(0.0, 0.0, 1.0));
      }

      vec3 blendNormalRnm(vec3 first, vec3 second) {
        return safeNormalize3(
          vec3(first.xy + second.xy, first.z * second.z - dot(first.xy, second.xy)),
          vec3(0.0, 0.0, 1.0)
        );
      }
#elif {{SECTION}} == 1
      vec4 packedUv(vec2 sourceUv, vec2 tiling, vec2 timeValue, float speed, float subTiling, float subSpeed) {
        vec2 baseSpeed = vec2(speed) * tiling;
        vec2 uv1 = sourceUv * tiling + timeValue * baseSpeed;
        vec2 tiling2 = tiling * subTiling;
        vec2 uv2 = sourceUv * tiling2 + timeValue * (speed * subSpeed * tiling2);
        return vec4(uv1, uv2);
      }
#else
      vec3 sampleDetailNormal(vec2 worldXZ, vec3 worldPosition, float elapsedTime) {
        vec2 timeValue = vec2(-elapsedTime) * material_OceanWaveFadeAndTimeScale.z;
        vec4 farUv = packedUv(
          worldXZ,
          vec2(material_OceanNormalMapping.z),
          timeValue,
          material_OceanNormalParameters.z * 0.5,
          0.5,
          0.15
        );
        vec3 farNormal = vec3(0.0, 0.0, 1.0);
        if (material_OceanTextureEnabled.y > 0.5) {
        vec3 farA = decodeNormalMap(texture2D(material_RoughWavesTexture, farUv.xy).rgb);
        vec3 farB = decodeNormalMap(texture2D(material_RoughWavesTexture, farUv.zw).rgb);
        farNormal = blendNormalRnm(farA, farB);
        }
        float pixelDistance = distance(camera_Position, worldPosition);
        float fadeFactor = clamp(
          (material_OceanNormalFadeEndDistance - pixelDistance)
            / max(material_OceanNormalFadeEndDistance - material_OceanNormalMapping.w, 0.0001),
          0.0,
          1.0
        );
        if (fadeFactor <= 0.0) {
          return safeNormalize3(farNormal, vec3(0.0, 0.0, 1.0));
        }

        vec4 nearUv = packedUv(
          worldXZ,
          material_OceanNormalMapping.xy,
          timeValue,
          material_OceanNormalParameters.z,
          material_OceanNormalParameters.y,
          material_OceanNormalParameters.w
        );
        vec3 nearNormal = vec3(0.0, 0.0, 1.0);
        if (material_OceanTextureEnabled.x > 0.5) {
        vec3 nearA = decodeNormalMap(texture2D(material_SmoothWavesTexture, nearUv.xy).rgb);
        vec3 nearB = decodeNormalMap(texture2D(material_SmoothWavesTexture, nearUv.zw).rgb);
        nearNormal = blendNormalRnm(nearA, nearB);
        }
        return safeNormalize3(mix(farNormal, nearNormal, fadeFactor), vec3(0.0, 0.0, 1.0));
      }
#endif

#endif
