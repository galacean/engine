#if {{WAKE_TAP_COUNT}} > 0
        vec2 wakeLateralDirection = vec2(-flowDirection.y, flowDirection.x);
        vec2 upstreamAtlasUvRaw0 = input.atlasUv
          - flowDirection * material_LocalMapWorldToUv.xy * {{WAKE_TAP_DISTANCE_0}};
        float upstreamAtlasInterior0 = step(0.001, upstreamAtlasUvRaw0.x)
          * step(upstreamAtlasUvRaw0.x, 0.999)
          * step(0.001, upstreamAtlasUvRaw0.y)
          * step(upstreamAtlasUvRaw0.y, 0.999);
        vec2 upstreamAtlasUv0 = clamp(upstreamAtlasUvRaw0, vec2(0.001), vec2(0.999));
        float upstreamSignedDistance0 = (
          texture2D(material_LocalMapTexture, upstreamAtlasUv0).a * 2.0 - 1.0
        ) * material_LocalMapDecode.z;
        vec2 upstreamLateralUvRawA0 = upstreamAtlasUvRaw0
          + wakeLateralDirection * material_LocalMapWorldToUv.xy * {{WAKE_LATERAL_PROBE_DISTANCE}};
        vec2 upstreamLateralUvRawB0 = upstreamAtlasUvRaw0
          - wakeLateralDirection * material_LocalMapWorldToUv.xy * {{WAKE_LATERAL_PROBE_DISTANCE}};
        float upstreamLateralInteriorA0 = step(0.001, upstreamLateralUvRawA0.x)
          * step(upstreamLateralUvRawA0.x, 0.999)
          * step(0.001, upstreamLateralUvRawA0.y)
          * step(upstreamLateralUvRawA0.y, 0.999);
        float upstreamLateralInteriorB0 = step(0.001, upstreamLateralUvRawB0.x)
          * step(upstreamLateralUvRawB0.x, 0.999)
          * step(0.001, upstreamLateralUvRawB0.y)
          * step(upstreamLateralUvRawB0.y, 0.999);
        float upstreamLateralSignedDistanceA0 = (
          texture2D(
            material_LocalMapTexture,
            clamp(upstreamLateralUvRawA0, vec2(0.001), vec2(0.999))
          ).a * 2.0 - 1.0
        ) * material_LocalMapDecode.z;
        float upstreamLateralSignedDistanceB0 = (
          texture2D(
            material_LocalMapTexture,
            clamp(upstreamLateralUvRawB0, vec2(0.001), vec2(0.999))
          ).a * 2.0 - 1.0
        ) * material_LocalMapDecode.z;
        float upstreamObstacleGate0 = min(
          smoothstep(
            {{WAKE_LATERAL_WET_SDF_START}},
            {{WAKE_LATERAL_WET_SDF_END}},
            upstreamLateralSignedDistanceA0
          ) * upstreamLateralInteriorA0,
          smoothstep(
            {{WAKE_LATERAL_WET_SDF_START}},
            {{WAKE_LATERAL_WET_SDF_END}},
            upstreamLateralSignedDistanceB0
          ) * upstreamLateralInteriorB0
        );
        float upstreamDryness0 = (
          1.0 - smoothstep(
            {{WAKE_DRY_SDF_START}},
            {{WAKE_DRY_SDF_END}},
            upstreamSignedDistance0
          )
        ) * upstreamAtlasInterior0 * upstreamObstacleGate0;
#if {{WAKE_TAP_COUNT}} > 1
        vec2 upstreamAtlasUvRaw1 = input.atlasUv
          - flowDirection * material_LocalMapWorldToUv.xy * {{WAKE_TAP_DISTANCE_1}};
        float upstreamAtlasInterior1 = step(0.001, upstreamAtlasUvRaw1.x)
          * step(upstreamAtlasUvRaw1.x, 0.999)
          * step(0.001, upstreamAtlasUvRaw1.y)
          * step(upstreamAtlasUvRaw1.y, 0.999);
        vec2 upstreamAtlasUv1 = clamp(upstreamAtlasUvRaw1, vec2(0.001), vec2(0.999));
        float upstreamSignedDistance1 = (
          texture2D(material_LocalMapTexture, upstreamAtlasUv1).a * 2.0 - 1.0
        ) * material_LocalMapDecode.z;
        vec2 upstreamLateralUvRawA1 = upstreamAtlasUvRaw1
          + wakeLateralDirection * material_LocalMapWorldToUv.xy * {{WAKE_LATERAL_PROBE_DISTANCE}};
        vec2 upstreamLateralUvRawB1 = upstreamAtlasUvRaw1
          - wakeLateralDirection * material_LocalMapWorldToUv.xy * {{WAKE_LATERAL_PROBE_DISTANCE}};
        float upstreamLateralInteriorA1 = step(0.001, upstreamLateralUvRawA1.x)
          * step(upstreamLateralUvRawA1.x, 0.999)
          * step(0.001, upstreamLateralUvRawA1.y)
          * step(upstreamLateralUvRawA1.y, 0.999);
        float upstreamLateralInteriorB1 = step(0.001, upstreamLateralUvRawB1.x)
          * step(upstreamLateralUvRawB1.x, 0.999)
          * step(0.001, upstreamLateralUvRawB1.y)
          * step(upstreamLateralUvRawB1.y, 0.999);
        float upstreamLateralSignedDistanceA1 = (
          texture2D(
            material_LocalMapTexture,
            clamp(upstreamLateralUvRawA1, vec2(0.001), vec2(0.999))
          ).a * 2.0 - 1.0
        ) * material_LocalMapDecode.z;
        float upstreamLateralSignedDistanceB1 = (
          texture2D(
            material_LocalMapTexture,
            clamp(upstreamLateralUvRawB1, vec2(0.001), vec2(0.999))
          ).a * 2.0 - 1.0
        ) * material_LocalMapDecode.z;
        float upstreamObstacleGate1 = min(
          smoothstep(
            {{WAKE_LATERAL_WET_SDF_START}},
            {{WAKE_LATERAL_WET_SDF_END}},
            upstreamLateralSignedDistanceA1
          ) * upstreamLateralInteriorA1,
          smoothstep(
            {{WAKE_LATERAL_WET_SDF_START}},
            {{WAKE_LATERAL_WET_SDF_END}},
            upstreamLateralSignedDistanceB1
          ) * upstreamLateralInteriorB1
        );
        float upstreamDryness1 = (
          1.0 - smoothstep(
            {{WAKE_DRY_SDF_START}},
            {{WAKE_DRY_SDF_END}},
            upstreamSignedDistance1
          )
        ) * upstreamAtlasInterior1 * upstreamObstacleGate1;
        float wakeDryness = max(upstreamDryness0, upstreamDryness1 * {{WAKE_SECONDARY_WEIGHT}});
#else
        float wakeDryness = upstreamDryness0;
#endif
        float wakeInterior = smoothstep(
          {{WAKE_INTERIOR_SDF_START}},
          {{WAKE_INTERIOR_SDF_END}},
          signedDistance
        );
        float wakeDetail = smoothstep(
          {{WAKE_DETAIL_NOISE_START}},
          {{WAKE_DETAIL_NOISE_END}},
          foamNoise + abs(flowSurface.x) * 0.12
        );
        float wakeFoam = wakeDryness
          * wakeInterior
          * flowWeight
          * wakeDetail
          * {{WAKE_FOAM_STRENGTH}};
#else
        float wakeFoam = 0.0;
#endif
