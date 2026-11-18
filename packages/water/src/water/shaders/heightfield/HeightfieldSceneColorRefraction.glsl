        float refractionFeatureWeight = step(0.5, material_RefractionEnabled) * {{REFRACTION_FEATURE_ENABLED}};
        vec3 baseNormalVS = normalize(mat3(camera_ViewMat) * input.baseNormalWS);
        vec3 surfaceNormalVS = normalize(mat3(camera_ViewMat) * surfaceNormalWS);
#if {{REFRACTION_NORMAL_SOURCE}} == 2
        vec2 refractionNormalDelta = appearanceLayerNormal0.xy;
#elif {{REFRACTION_NORMAL_SOURCE}} == 1
        vec2 refractionNormalDelta = appearanceNormalTS.xy;
#else
        vec2 refractionNormalDelta = surfaceNormalVS.xy - baseNormalVS.xy;
#endif
        refractionDepthWeight = smoothstep(
          {{REFRACTION_DEPTH_START}},
          {{REFRACTION_DEPTH_END}},
          opticalDepth
        );
        float fragmentShoreDamping = smoothstep(
          0.0,
          max(material_ShoreDampingWidth, 0.0001),
          signedDistance
        );
#if {{REFRACTION_VALIDATION_MODE}} == 1
        refractionShoreWeight = 1.0;
#else
        refractionShoreWeight = smoothstep(0.12, 0.72, fragmentShoreDamping);
#endif
        vec2 displacedScreenUv = screenUv
          + refractionNormalDelta
            * {{REFRACTION_UV_SCALE_PROPERTY}}
            * refractionFeatureWeight;
        float refractionScreenInterior = step(0.002, displacedScreenUv.x)
          * step(displacedScreenUv.x, 0.998)
          * step(0.002, displacedScreenUv.y)
          * step(displacedScreenUv.y, 0.998);
        vec2 refractedScreenUv = clamp(displacedScreenUv, vec2(0.002), vec2(0.998));
#if {{REFRACTION_VALIDATION_MODE}} > 0
        float refractedSceneDepthBufferSample = texture2D(
          camera_DepthTexture,
          refractedScreenUv
        ).r;
        float refractedSceneEyeDepthSample = remapDepthBufferEyeDepth(
          refractedSceneDepthBufferSample
        );
        bool refractedSceneDepthFinite = refractedSceneEyeDepthSample >= 0.0
          && refractedSceneEyeDepthSample <= 1000000.0;
        float refractedSceneDepthAvailable = refractedSceneDepthFinite
          && refractedSceneDepthBufferSample < 1.0
            ? 1.0
            : 0.0;
        float refractedSceneEyeDepth = refractedSceneDepthAvailable > 0.5
          ? refractedSceneEyeDepthSample
          : input.surfaceEyeDepth;
        float refractedOpticalDepth = max(refractedSceneEyeDepth - input.surfaceEyeDepth, 0.0);
#endif
#if {{REFRACTION_VALIDATION_MODE}} == 0
        refractionDepthContinuity = 1.0;
        refractionSampleValidity = refractionScreenInterior
          * coverage
          * refractionShoreWeight
          * step(0.001, authoredDepth);
#elif {{REFRACTION_VALIDATION_MODE}} == 1
        refractionDepthContinuity = 1.0;
        // Source-faithful shifted-depth validation: the displaced sample is
        // accepted only while its geometry remains behind the water surface.
        float refractedGeometryBehindSurface = step(
          0.000001,
          refractedSceneEyeDepth - input.surfaceEyeDepth
        ) * refractedSceneDepthAvailable;
#if {{USE_LOCAL_BATHYMETRY}}
        float localRefractedGeometryBehindSurface = coverage * step(0.000001, authoredDepth);
#else
        float localRefractedGeometryBehindSurface = 0.0;
#endif
        refractionSampleValidity = refractionScreenInterior * max(
          refractedGeometryBehindSurface,
          (1.0 - refractedSceneDepthAvailable) * localRefractedGeometryBehindSurface
        );
#else
        float refractionDepthTolerance = max(
          {{REFRACTION_DEPTH_TOLERANCE_MINIMUM}},
          opticalDepth * {{REFRACTION_DEPTH_TOLERANCE_SCALE}}
        );
        float sampledRefractionDepthContinuity = 1.0 - smoothstep(
          refractionDepthTolerance,
          refractionDepthTolerance * 3.0 + 0.2,
          abs(refractedSceneEyeDepth - sceneEyeDepth)
        );
        refractionDepthContinuity = mix(
          1.0,
          sampledRefractionDepthContinuity,
          refractedSceneDepthAvailable
        );
        float refractedGeometryBehindSurface = smoothstep(0.03, 0.22, refractedOpticalDepth)
          * refractedSceneDepthAvailable;
#if {{USE_LOCAL_BATHYMETRY}}
        float localRefractedGeometryBehindSurface = step(0.000001, authoredDepth);
#else
        float localRefractedGeometryBehindSurface = 0.0;
#endif
        float resolvedRefractedGeometryBehindSurface = max(
          refractedGeometryBehindSurface,
          (1.0 - refractedSceneDepthAvailable) * localRefractedGeometryBehindSurface
        );
        refractionSampleValidity = waterSurfaceAppearanceV2RefractionValidity(
          refractionScreenInterior,
          coverage,
          refractionShoreWeight,
          centeredDepthBehind,
          resolvedRefractedGeometryBehindSurface,
          refractionDepthContinuity
        );
#endif
        refractionUvDelta = refractedScreenUv - screenUv;
        centeredOpaqueColor = texture2D(camera_OpaqueTexture, screenUv).rgb;
        displacedOpaqueColor = texture2D(camera_OpaqueTexture, refractedScreenUv).rgb;
