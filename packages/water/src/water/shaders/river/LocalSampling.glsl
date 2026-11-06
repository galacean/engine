#if {{USE_LOCAL_MAP}}
        // Chunk-local object XZ plus its stable compiled origin is the exact
        // inverse-planar result for the River body, independent of outer
        // translation, yaw, and floating-origin rebasing.
        vec2 bodyLocalXZ = input.objectPosition.xz + renderer_LocalMapBodyOrigin.xy;
        vec2 rawLocalMapUv = bodyLocalXZ * renderer_LocalMapBodyToUv.xy + renderer_LocalMapBodyToUv.zw;
        vec2 localMapUv = clamp(rawLocalMapUv, renderer_LocalMapUvRect.xy, renderer_LocalMapUvRect.zw);
        vec4 localMapSample = texture2D(material_LocalMapTexture, localMapUv);
        vec2 localFlowBody = localMapSample.rg * 2.0 - 1.0;
        vec3 localFlowWorld = mat3(renderer_ModelMat) * vec3(localFlowBody.x, 0.0, localFlowBody.y);
        vec2 localFlow = localFlowWorld.xz;
        float atlasRectMask = step(renderer_LocalMapUvRect.x, rawLocalMapUv.x)
          * step(renderer_LocalMapUvRect.y, rawLocalMapUv.y)
          * step(rawLocalMapUv.x, renderer_LocalMapUvRect.z)
          * step(rawLocalMapUv.y, renderer_LocalMapUvRect.w);
        float localSignedDistance = mix(1.0, localMapSample.a * 2.0 - 1.0, atlasRectMask);
        float confluenceInteriorWeight = smoothstep(
          0.0,
          {{VALUE_001_GLSL_RIVER_SURFACE_SHADER_TUNING_CONFLUENCEINTERIORB}},
          max(localSignedDistance, 0.0)
        );
        float localEffectWeight = atlasRectMask * mix(1.0, confluenceInteriorWeight, renderer_LocalMapConfluence);
        float confluenceFlowWeight = mix(
          1.0,
          {{VALUE_002_GLSL_RIVER_SURFACE_SHADER_TUNING_CONFLUENCEFLOWBLEND}},
          renderer_LocalMapConfluence
        );
        float confluenceFoamWeight = mix(
          1.0,
          {{VALUE_003_GLSL_RIVER_SURFACE_SHADER_TUNING_CONFLUENCEFOAMWEIGH}},
          renderer_LocalMapConfluence
        );
        float localFlowWeight = step(0.05, dot(localFlow, localFlow)) * localEffectWeight * confluenceFlowWeight;
        float localFoamSource = localMapSample.b * localEffectWeight * confluenceFoamWeight;
        float obstacleRegionWeight = (1.0 - renderer_LocalMapConfluence) * localEffectWeight;
#else
        vec2 localFlow = input.worldFlow;
        float localFlowWeight = 0.0;
        float localFoamSource = 0.0;
        float localSignedDistance = 1.0;
        float localEffectWeight = 0.0;
        float atlasRectMask = 0.0;
        float obstacleRegionWeight = 0.0;
#endif
