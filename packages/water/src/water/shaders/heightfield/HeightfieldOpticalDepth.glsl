#if {{OPTICAL_DEPTH_STAGE}} == 0
        vec3 fieldViewDirection = safeNormalize3(camera_Position - input.worldPosition, input.macroNormalWS);
        float sceneRayEyeScale = input.surfaceEyeDepth / max(length(camera_Position - input.worldPosition), 0.001);
        float orthographicProjection = 0.0;
#ifdef CAMERA_ORTHOGRAPHIC
        fieldViewDirection = safeNormalize3((camera_ViewInvMat * vec4(0.0, 0.0, -1.0, 0.0)).xyz, input.macroNormalWS);
        sceneRayEyeScale = 1.0;
        orthographicProjection = 1.0;
#endif
        float fallbackSceneRayDepth = waterSurfaceDerivedSceneRayDepth(authoredDepth, input.macroNormalWS, fieldViewDirection);
#if {{USE_SCENE_DEPTH}}
        vec2 screenUv = (input.clipPosition.xy / input.clipPosition.w) * 0.5 + 0.5;
        float sceneDepthBufferSample = texture2D(camera_DepthTexture, screenUv).r;
        float sceneEyeDepthSample = remapDepthBufferEyeDepth(sceneDepthBufferSample);
        float centeredSceneDepthAvailable = waterSurfaceDepthSampleValidity(sceneDepthBufferSample, sceneEyeDepthSample, input.surfaceEyeDepth);
        float sceneEyeDepth = mix(input.surfaceEyeDepth + fallbackSceneRayDepth * sceneRayEyeScale, sceneEyeDepthSample, centeredSceneDepthAvailable);
        float sceneDepthDelta = max(sceneEyeDepth - input.surfaceEyeDepth, 0.0);
        float sceneRayDepth = sceneDepthDelta / max(sceneRayEyeScale, 0.001);
        vec3 opaquePositionWS = waterSurfaceReconstructOpaquePositionWS(input.worldPosition, camera_Position, camera_ViewInvMat, input.surfaceEyeDepth, sceneEyeDepth, orthographicProjection);
        float exactSurfaceNormalDepth = waterSurfaceNormalDepth(input.worldPosition, opaquePositionWS, input.macroNormalWS);
        float surfaceNormalDepth = mix(authoredDepth, exactSurfaceNormalDepth, centeredSceneDepthAvailable);
        float sampledOpticalDepth = sceneRayDepth;
        float opticalDepth = min(sampledOpticalDepth, authoredDepth);
        float centeredDepthBehind = centeredSceneDepthAvailable * step(0.000001, sceneDepthDelta);
#else
#if {{DECLARE_LOCAL_BATHYMETRY_SCREEN_UV}}
        vec2 screenUv = (input.clipPosition.xy / input.clipPosition.w) * 0.5 + 0.5;
#endif
        float sceneRayDepth = fallbackSceneRayDepth;
        float sceneDepthDelta = sceneRayDepth * sceneRayEyeScale;
        float surfaceNormalDepth = authoredDepth;
        float opticalDepth = authoredDepth;
        float centeredDepthBehind = step(0.000001, authoredDepth);
#endif
#else
#if {{USE_LOCAL_BATHYMETRY}}
        // Water-owned normal depth projects to ray distance. Eye-Z remains a separate artistic field.
        float localBathymetryProjectionDenominator = 1.0;
#ifdef CAMERA_ORTHOGRAPHIC
        localBathymetryProjectionDenominator = abs((mat3(camera_ViewMat) * input.baseNormalWS).z);
#else
        localBathymetryProjectionDenominator = abs(dot(viewDirection, input.baseNormalWS));
#endif
        float localSceneRayDepth = min(authoredDepth / max(localBathymetryProjectionDenominator, 0.001), 1000000.0);
#if {{USE_SCENE_DEPTH}}
        float bodyBoundedSceneRayDepth = min(sceneRayDepth, localSceneRayDepth);
        sceneRayDepth = mix(localSceneRayDepth, bodyBoundedSceneRayDepth, centeredSceneDepthAvailable);
        sceneDepthDelta = sceneRayDepth * sceneRayEyeScale;
        centeredDepthBehind = max(centeredDepthBehind, (1.0 - centeredSceneDepthAvailable) * step(0.000001, authoredDepth));
#else
        sceneRayDepth = localSceneRayDepth;
        sceneDepthDelta = sceneRayDepth * sceneRayEyeScale;
#endif
        opticalDepth = min(sceneRayDepth, max(material_MaximumSurfaceOpticalDistance, 0.0));
#endif
#endif
