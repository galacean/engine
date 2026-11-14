#ifndef WATER_OCEAN_REFRACTION_{{SECTION}}_INCLUDED
#define WATER_OCEAN_REFRACTION_{{SECTION}}_INCLUDED

#if {{SECTION}} == 0
      vec3 reconstructOpaquePositionWS(vec2 uv, float eyeDepth) {
        vec2 ndc = uv * 2.0 - 1.0;
        vec3 positionVS;
        #ifdef CAMERA_ORTHOGRAPHIC
          positionVS = vec3(
            ndc.x / camera_ProjMat[0][0],
            ndc.y / camera_ProjMat[1][1],
            -eyeDepth
          );
        #else
          positionVS = vec3(
            ndc.x * eyeDepth / camera_ProjMat[0][0],
            ndc.y * eyeDepth / camera_ProjMat[1][1],
            -eyeDepth
          );
        #endif
        return (camera_ViewInvMat * vec4(positionVS, 1.0)).xyz;
      }
#else
      float smoothstep01(float value) {
        float bounded = clamp(value, 0.0, 1.0);
        return bounded * bounded * (3.0 - 2.0 * bounded);
      }

      float screenEdgeMask(vec2 screenUv, float refractionLength) {
        float reciprocalLength = 1.0 / max(refractionLength, 0.000001);
        vec2 remapped = clamp(
          vec2(reciprocalLength) - abs(screenUv * 2.0 - 1.0) * reciprocalLength,
          vec2(0.0),
          vec2(1.0)
        );
        return smoothstep01(remapped.x) * smoothstep01(remapped.y);
      }

      vec2 physicalRefractionOffset(
        vec2 screenUv,
        vec3 cameraForwardWS,
        vec3 tangentWorldNormal,
        float strength
      ) {
        // An identical medium has no displacement, including the artistic edge fallback.
        if (material_IndexOfRefraction == 1.0) return vec2(0.0);
        vec3 physicalRefractionRayWS = refract(
          -cameraForwardWS,
          tangentWorldNormal,
          1.0 / material_IndexOfRefraction
        );
        vec3 physicalRefractionRayVS = mat3(camera_ViewMat) * physicalRefractionRayWS;
        float edgeMask = screenEdgeMask(screenUv, length(physicalRefractionRayVS.xy));
        vec2 normalFallback = tangentWorldNormal.xz * 0.5;
        return mix(normalFallback, physicalRefractionRayVS.xy, edgeMask) * strength;
      }

      float screenInterior(vec2 uv) {
        return step(0.001, uv.x) * step(uv.x, 0.999)
          * step(0.001, uv.y) * step(uv.y, 0.999);
      }
#endif

#endif
