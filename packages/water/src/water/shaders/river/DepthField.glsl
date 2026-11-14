        float sceneDepthBufferSample = texture2D(camera_DepthTexture, screenUv).r;
        float sceneEyeDepthSample = remapDepthBufferEyeDepth(sceneDepthBufferSample);
        float sceneDepthAvailable = waterSurfaceDepthSampleValidity(
          sceneDepthBufferSample,
          sceneEyeDepthSample,
          input.surfaceEyeDepth
        );
        vec3 fieldViewDirection = safeNormalize3(
          camera_Position - input.worldPosition,
          input.macroNormalWS
        );
        float orthographicProjection = 0.0;
        float sceneRayEyeScale = input.surfaceEyeDepth / max(
          length(camera_Position - input.worldPosition),
          0.001
        );
#ifdef CAMERA_ORTHOGRAPHIC
        orthographicProjection = 1.0;
        sceneRayEyeScale = 1.0;
        fieldViewDirection = safeNormalize3(
          (camera_ViewInvMat * vec4(0.0, 0.0, -1.0, 0.0)).xyz,
          input.macroNormalWS
        );
#endif
        float fallbackSceneRayDepth = waterSurfaceDerivedSceneRayDepth(
          max(input.authoredDepth, 0.0),
          input.macroNormalWS,
          fieldViewDirection
        );
        float sceneEyeDepth = mix(
          input.surfaceEyeDepth + fallbackSceneRayDepth * sceneRayEyeScale,
          sceneEyeDepthSample,
          sceneDepthAvailable
        );
        float sceneDepthDelta = max(sceneEyeDepth - input.surfaceEyeDepth, 0.0);
        // Absorption uses the distance along the camera ray, not vertical bed depth.
        float sampledOpticalDepth = sceneDepthDelta / max(sceneRayEyeScale, 0.001);
        vec3 opaquePositionWS = waterSurfaceReconstructOpaquePositionWS(
          input.worldPosition,
          camera_Position,
          camera_ViewInvMat,
          input.surfaceEyeDepth,
          sceneEyeDepth,
          orthographicProjection
        );
        float exactSurfaceNormalDepth = waterSurfaceNormalDepth(
          input.worldPosition,
          opaquePositionWS,
          input.macroNormalWS
        );
        float waterSurfaceNormalDepthValue = mix(
          max(input.authoredDepth, 0.0),
          exactSurfaceNormalDepth,
          sceneDepthAvailable
        );
