
      mat4 renderer_MVPMat;
      mat4 renderer_ModelMat;
      mat4 renderer_NormalMat;
      mat4 camera_ViewMat;
      // Depth reconstruction needs the inverse view for scene depth and orthographic fallback.
      mat4 camera_ViewInvMat;
      vec3 camera_Position;
      vec4 scene_ElapsedTime;
{{VALUE_005_SCENELIGHTINGUNIFORMDECLARATIONS}}
      vec3 scene_WindVelocity;
      vec3 material_WindVelocity;
      float material_WindVelocityOverride;
#if {{USE_SCENE_DEPTH}}
      highp sampler2D camera_DepthTexture;
#endif
#if {{USE_CAMERA_OPAQUE_TEXTURE}}
      sampler2D camera_OpaqueTexture;
#endif
#if {{USE_SCENE_DEPTH}}
      vec4 camera_ProjectionParams;
      vec4 camera_DepthBufferParams;
#endif
      sampler2D material_LocalMapTexture;
      sampler2D material_SurfaceTexture;
{{VALUE_008_CREATEWATERSURFACEAPPEARANCEV2UNIFORMDECLARATIONS_SURFAC}}
      vec4 material_LocalMapWorldToUv;
      vec4 material_WaterWorldToLocalPlanar;
      vec4 renderer_AtlasUvRect;
      vec4 material_LocalMapDecode;
      vec4 material_ShallowColor;
      vec4 material_DeepColor;
      vec4 material_FoamColor;
      float material_Alpha;
      float material_Clarity;
      float material_TimeScale;
      float material_WaveStrength;
      float material_MicroNormalStrength;
      float material_FoamIntensity;
      float material_ShoreDampingWidth;
      float material_SurfaceTimeOverride;
      float material_DebugMode;
      float material_RefractionEnabled;
      float material_CompositionMode;
      float material_OpticsCalibrationMode;
      float material_WavesEnabled;
      float material_MicroNormalsEnabled;
      float material_FoamEnabled;
      float material_LocalFoamMaskEnabled;
      vec4 material_LocalFoamMaskCenterHalfSize;
      float material_LocalFoamMaskFeather;
#ifdef MATERIAL_WATER_PRESENTATION_REVEAL
      float material_PresentationRevealProgress;
      float material_PresentationRevealBand;
      vec2 material_PresentationRevealRepeat;
#endif
      float material_MaxVerticalDisplacement;
      vec3 material_AbsorptionCoefficient;
      vec3 material_ScatteringColor;
      float material_ScatteringCoefficient;
      float material_MaximumSurfaceOpticalDistance;
      float material_IndexOfRefraction;
      float material_FresnelF0;
      float material_RefractionStrength;
      float material_Roughness;
      float material_ReflectionIntensity;
      float material_ReflectionSource;
      float material_WaterScreenSpaceReflectionCompositeIntensity;
      samplerCube material_ReflectionCubeTexture;
      sampler2D camera_ScreenSpaceReflectionTexture;
      float camera_ScreenSpaceReflectionIntensity;
      float camera_ScreenSpaceReflectionMaxRoughness;
{{VALUE_009_REFLECTIONUNIFORMDECLARATIONS_QUALITY}}
#if {{WAVE_COUNT}} > 0
      vec4 material_WaveA0;
      vec4 material_WaveB0;
      vec4 material_WaveA1;
      vec4 material_WaveB1;
#endif
#if {{WAVE_COUNT}} > 2
      vec4 material_WaveA2;
      vec4 material_WaveB2;
      vec4 material_WaveA3;
      vec4 material_WaveB3;
      vec4 material_WaveA4;
      vec4 material_WaveB4;
      vec4 material_WaveA5;
      vec4 material_WaveB5;
#endif
#if {{WAVE_COUNT}} > 6
      vec4 material_WaveA6;
      vec4 material_WaveB6;
      vec4 material_WaveA7;
      vec4 material_WaveB7;
      vec4 material_WaveA8;
      vec4 material_WaveB8;
      vec4 material_WaveA9;
      vec4 material_WaveB9;
      vec4 material_WaveA10;
      vec4 material_WaveB10;
      vec4 material_WaveA11;
      vec4 material_WaveB11;
#endif
      struct Attributes {
        vec4 POSITION;
        vec3 NORMAL;
        vec4 TANGENT;
        vec2 TEXCOORD_0;
      };
      struct Varyings {
        vec3 worldPosition;
        vec3 objectPosition;
        vec2 meshUv;
        vec3 baseNormalWS;
        vec3 macroNormalWS;
        vec3 tangentWS;
        vec2 atlasUv;
        float baseSurfaceHeight;
        float waveOffset;
        float surfaceEyeDepth;
        float shoreDamping;
        vec4 clipPosition;
      };

{{VALUE_012_HEIGHTFIELD_WATER_PLANAR_TRANSFORM_SHADER_FUNCTIONS}}
{{VALUE_013_HEIGHTFIELD_WATER_RAIN_RIPPLE_SHADER_FUNCTIONS}}
{{VALUE_014_WATER_ENVIRONMENT_REFLECTION_SHADER_FUNCTIONS}}
{{VALUE_015_USELOCALBATHYMETRY_CREATEWATERSPATIALFIELDSHADERDECODEFU}}
{{VALUE_016_CREATEWATERSURFACEAPPEARANCESHADERFUNCTIONS}}
{{HEIGHTFIELD_DEPTH_FUNCTIONS}}
{{VALUE_017_CREATEWATERSURFACEAPPEARANCEV2SHADERFUNCTIONS_SURFACEAPP}}
      float saturate(float value) {
        return clamp(value, 0.0, 1.0);
      }
      #include "ShaderLibrary/Lighting/VolumetricCloudShadow.glsl"
{{VALUE_018_CONTACTFOAMSHADERFUNCTIONSV2_SURFACEAPPEARANCEV2}}
{{VALUE_019_SHAREDSURFACEASSEMBLY_SHAREDFUNCTIONSOURCE}}
{{VALUE_020_SURFACEAPPEARANCELIGHTINGFUNCTIONS}}
{{HEIGHTFIELD_GEOMETRY_FUNCTIONS}}

#if {{USE_SCENE_DEPTH}}
      float remapDepthBufferEyeDepth(float depth) {
        #ifdef CAMERA_ORTHOGRAPHIC
          return camera_ProjectionParams.y + (camera_ProjectionParams.z - camera_ProjectionParams.y) * depth;
        #else
          return 1.0 / (camera_DepthBufferParams.z * depth + camera_DepthBufferParams.w);
        #endif
      }
#endif

      Varyings vert(Attributes attr) {
        Varyings output;
        vec4 baseWorldPosition = renderer_ModelMat * attr.POSITION;
        vec3 computedBaseNormalWS = normalize(mat3(renderer_ModelMat) * attr.NORMAL);
        vec3 computedBaseTangentWS = normalize(mat3(renderer_ModelMat) * attr.TANGENT.xyz);
        vec3 computedBaseBitangentWS = normalize(
          cross(computedBaseNormalWS, computedBaseTangentWS) * attr.TANGENT.w
        );
        vec2 computedAtlasUv = attr.TEXCOORD_0;
        vec4 localMap = texture2D(material_LocalMapTexture, computedAtlasUv);
        vec2 flowXZ = (localMap.rg * 2.0 - 1.0) * material_LocalMapDecode.x;
{{VALUE_035_USELOCALBATHYMETRY_FLOAT_AUTHOREDDEPTH_WATERSPATIALFIELD}}
        signedDistance = waterConnectionShore(baseWorldPosition.xz, signedDistance);
        float shoreDamping = smoothstep(0.0, max(material_ShoreDampingWidth, 0.0001), signedDistance);
        float flowSpeed = length(flowXZ);
        float flowWeight = smoothstep(
          {{VALUE_036_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_MINIMUMFLOWSPEED}},
          {{VALUE_037_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_MAXIMUMFLOWSPEED_0}},
          flowSpeed
        );
        vec2 flowDirection = safeNormalize2(flowXZ, vec2(-0.36, -0.9329523));
        float macroFlowAlignment = flowWeight * {{VALUE_038_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_MACROFLOWALIGNMENT}};
        float macroAmplitudeScale = mix(
          {{VALUE_039_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_STILLMACROAMPLITUD}},
          1.0,
          flowWeight
        );
        float waveOffset = 0.0;
        float tangentSlope = 0.0;
        float bitangentSlope = 0.0;
{{VALUE_041_WAVEAPPLYSTATEMENTS_WAVECOUNT}}
        vec3 computedMacroNormalWS = normalize(
          computedBaseNormalWS
            - computedBaseTangentWS * tangentSlope
            - computedBaseBitangentWS * bitangentSlope
        );
        waveOffset *= waterConnectionFacts(baseWorldPosition.xz).x;
        vec3 displacedWorldPosition = baseWorldPosition.xyz + computedBaseNormalWS * waveOffset;
        vec4 localPosition = attr.POSITION + vec4(attr.NORMAL * waveOffset, 0.0);
        vec4 computedClipPosition = renderer_MVPMat * localPosition;
        gl_Position = computedClipPosition;
        output.worldPosition = displacedWorldPosition;
        output.objectPosition = attr.POSITION.xyz;
        output.meshUv = attr.TEXCOORD_0;
        output.baseNormalWS = computedBaseNormalWS;
        output.macroNormalWS = computedMacroNormalWS;
        output.tangentWS = computedBaseTangentWS;
        output.atlasUv = computedAtlasUv;
        output.baseSurfaceHeight = baseWorldPosition.y;
        output.waveOffset = waveOffset;
        output.surfaceEyeDepth = -(camera_ViewMat * vec4(displacedWorldPosition, 1.0)).z;
        output.shoreDamping = shoreDamping;
        output.clipPosition = computedClipPosition;
        return output;
      }

      void frag(Varyings input) {
        if (waterConnectionFacts(input.worldPosition.xz).w < 0.5) discard;
        float elapsedTime = surfaceTime();
        vec4 localMap = texture2D(material_LocalMapTexture, input.atlasUv);
        vec2 flowXZ = (localMap.rg * 2.0 - 1.0) * material_LocalMapDecode.x;
{{VALUE_042_USELOCALBATHYMETRY_FLOAT_AUTHOREDDEPTH_MAX_WATERSPATIALF}}
        signedDistance = waterConnectionShore(input.worldPosition.xz, signedDistance);
        // Keep the shoreline transition wider than both one screen-space
        // derivative and one RGBA8 signed-distance decode step. A fixed 8cm
        // threshold becomes a hard staircase once a large Lake is capped to a
        // multi-metre Coverage texel size.
        float coverageHalfWidth = max(
          0.08,
          max(
            fwidth(signedDistance) * 1.25,
            material_LocalMapDecode.z * (2.0 / 255.0)
          )
        );
        float coverage = smoothstep(-coverageHalfWidth, coverageHalfWidth, signedDistance);
{{VALUE_043_OPTICALDEPTHCALCULATION_USESCENEDEPTH_USECOMPOSITEDEPTHR}}
        opticalDepth = min(opticalDepth, max(material_MaximumSurfaceOpticalDistance, 0.0));
        float depthRatio = saturate(opticalDepth / max(material_LocalMapDecode.y, 0.0001));
        float flowSpeed = length(flowXZ);
        float flowWeight = smoothstep(
          {{VALUE_045_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_MINIMUMFLOWSPEED}},
          {{VALUE_046_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_MAXIMUMFLOWSPEED_0}},
          flowSpeed
        );
        float sceneWindSpeed = length(waterWindVelocity().xz);
        vec2 stillWaterDirection = sceneWindSpeed > 0.0001
          ? waterWindVelocity().xz / sceneWindSpeed
          : vec2(-0.36, -0.9329523);
        vec2 flowDirection = safeNormalize2(
          mix(stillWaterDirection, safeNormalize2(flowXZ, stillWaterDirection), flowWeight * {{VALUE_047_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_FLOWINGDIRECTIONWE}}),
          stillWaterDirection
        );
        vec3 baseWorldPosition = input.worldPosition - input.baseNormalWS * input.waveOffset;
        signedDistance = waterConnectionShore(baseWorldPosition.xz, signedDistance);
        float heightfieldObstacleContact = opticalDepth;
{{VALUE_048_SHAREDSURFACEASSEMBLY_GEOMETRYBRIDGESOURCE}}
{{VALUE_049_FLOWSURFACELAYERSTATEMENTS_QUALITY}}
        float detailStrength = max(
          material_MicroNormalStrength,
          {{VALUE_050_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_MINIMUMNORMALSTREN}}
        ) * material_MicroNormalsEnabled * mix(
          {{VALUE_051_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_STILLMICRONORMALSC}},
          1.0,
          flowWeight
        );
        vec2 worldDetailSlopeXZ = waterLocalDirectionToWorldXZ(flowSurface.xy);
        vec3 worldDetailSlope = vec3(worldDetailSlopeXZ.x, 0.0, worldDetailSlopeXZ.y);
        vec3 tangentDetailSlope = worldDetailSlope
          - input.macroNormalWS * dot(worldDetailSlope, input.macroNormalWS);
        vec3 surfaceNormalWS = safeNormalize3(
          input.macroNormalWS + tangentDetailSlope * detailStrength,
          input.macroNormalWS
        );
{{VALUE_052_CREATEWATERSURFACEAPPEARANCEV2NORMALSTATEMENTS_SURFACEAP}}
        surfaceNormalWS = waterConnectionNormal(input.worldPosition.xz, surfaceNormalWS);
{{VALUE_053_CREATEHEIGHTFIELDWATERRAINRIPPLENORMALSTATEMENTS_QUALITY}}
        vec3 viewDirection = safeNormalize3(camera_Position - input.worldPosition, input.baseNormalWS);
        float normalFacing = step(0.0, dot(surfaceNormalWS, viewDirection)) * 2.0 - 1.0;
        surfaceNormalWS *= normalFacing;
        float normalDotView = saturate(dot(surfaceNormalWS, viewDirection));
{{VALUE_054_LOCALBATHYMETRYOPTICALDEPTHREFINEMENT_USELOCALBATHYMETRY}}
        float fresnelF0 = clamp(material_FresnelF0, 0.0, 1.0);
        // Diagnostics-only; final Fresnel evaluation remains inside the shared Closure.
        float effectiveFresnel = waterSurfaceSchlick(fresnelF0, 1.0, normalDotView);
        float shoreEnvelope = 1.0 - smoothstep(
          0.0,
          max(
            material_ShoreDampingWidth * {{VALUE_055_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_SHOREFOAMWIDTHSCAL}},
            0.0001
          ),
          max(signedDistance, 0.0)
        );
        float foamNoise = saturate(flowSurface.z * 0.62 + flowSurface.w * 0.38);
        float foamBreakup = smoothstep(
          {{VALUE_056_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_SHOREFOAMNOISESTAR}},
          {{VALUE_057_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_SHOREFOAMNOISEEND}},
          foamNoise + (1.0 - abs(flowSurface.z - flowSurface.w)) * 0.08
        );
        float shoreFoam = shoreEnvelope * foamBreakup;
        float macroSlope = 1.0 - saturate(dot(input.baseNormalWS, input.macroNormalWS));
        float crestFoam = smoothstep(
          {{VALUE_058_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_CRESTFOAMSTART}},
          {{VALUE_059_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_CRESTFOAMEND}},
          macroSlope + max(input.waveOffset, 0.0) * 0.22
        ) * smoothstep(0.49, 0.78, foamNoise);
        float currentFoam = smoothstep(
          {{VALUE_060_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_CURRENTFOAMSPEEDST}},
          {{VALUE_061_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_CURRENTFOAMSPEEDEN}},
          flowSpeed
        ) * smoothstep(
          {{VALUE_062_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_CURRENTFOAMNOISEST}},
          {{VALUE_063_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_CURRENTFOAMNOISEEN}},
          flowSurface.w
        ) * input.shoreDamping;
{{VALUE_064_WAKEFOAMSTATEMENTS_QUALITY}}
        vec2 localFoamMaskDelta = abs(
          input.worldPosition.xz - material_LocalFoamMaskCenterHalfSize.xy
        ) - material_LocalFoamMaskCenterHalfSize.zw;
        float localFoamMaskSignedDistance = max(localFoamMaskDelta.x, localFoamMaskDelta.y);
        // The local mask is a real foam feature, not an independent invisible
        // refraction kill switch. Disabling the master foam feature therefore
        // disables both its visible contribution and its refraction suppression.
        float localFoamMask = material_LocalFoamMaskEnabled * material_FoamEnabled * (
          1.0 - smoothstep(
            -max(material_LocalFoamMaskFeather, 0.0001),
            max(material_LocalFoamMaskFeather, 0.0001),
            localFoamMaskSignedDistance
          )
        );
        float foamMotionScale = mix(
          {{VALUE_065_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_STILLFOAMSCALE}},
          1.0,
          flowWeight
        );
{{VALUE_066_CREATEWATERSURFACEAPPEARANCEV2BOUNDARYSTATEMENTS_SURFACE}}
{{VALUE_067_WATERDIFFUSELIGHTINGSTATEMENTS_LITSCENECOLORCLOSURE}}
        float clarity = saturate(material_Clarity);
        // Authored color is resolved only by the shared V2 Closure below.
        vec3 waterColor = material_ShallowColor.rgb;
        vec3 centeredOpaqueColor = waterColor;
        vec3 displacedOpaqueColor = waterColor;
        vec2 refractionUvDelta = vec2(0.0);
        float refractionDepthContinuity = 1.0;
        float refractionSampleValidity = 0.0;
        float refractionDepthWeight = 0.0;
        float refractionShoreWeight = 0.0;
{{VALUE_068_SCENECOLORREFRACTIONV2_QUALITY_SURFACEAPPEARANCEV2_USESC}}
{{VALUE_069_CREATEWATERSURFACEAPPEARANCEV2DEPTHRESPONSESTATEMENTS_SU}}
{{VALUE_070_SURFACEREFLECTIONSTATEMENTS_QUALITY}}
{{VALUE_071_CREATEHEIGHTFIELDV2FINALCLOSURESTATEMENTS_SURFACEAPPEARA}}

        // C and A are retained independently so framebuffer analysis can prove
        // whether the legacy transparent path applies the opaque background twice.
        vec3 shaderCompositedColor = resolvedWaterClosure.rgb;
        float surfaceAlpha = resolvedWaterClosure.a;
        vec3 fragmentColor = shaderCompositedColor;
        float fragmentAlpha = surfaceAlpha;
#ifdef MATERIAL_WATER_PRESENTATION_REVEAL
        float presentationBand = max(material_PresentationRevealBand, 0.0001);
        vec2 presentationTileUv = fract(input.atlasUv * max(material_PresentationRevealRepeat, vec2(1.0)));
        vec2 presentationGrid = vec2(64.0, 48.0);
        vec2 presentationNoisePosition = presentationTileUv * presentationGrid;
        vec2 presentationCell = floor(presentationNoisePosition);
        vec2 presentationCellUv = fract(presentationNoisePosition);
        presentationCellUv = presentationCellUv * presentationCellUv * (3.0 - 2.0 * presentationCellUv);
        float presentationCellNoise00 = fract(sin(dot(presentationCell, vec2(127.1, 311.7))) * 43758.5453123);
        float presentationCellNoise10 = fract(sin(dot(presentationCell + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453123);
        float presentationCellNoise01 = fract(sin(dot(presentationCell + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453123);
        float presentationCellNoise11 = fract(sin(dot(presentationCell + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453123);
        float presentationNoise = mix(
          mix(presentationCellNoise00, presentationCellNoise10, presentationCellUv.x),
          mix(presentationCellNoise01, presentationCellNoise11, presentationCellUv.x),
          presentationCellUv.y
        );
        float presentationProgress = clamp(material_PresentationRevealProgress, 0.0, 1.0);
        float presentationVisibility = smoothstep(
          presentationNoise - presentationBand,
          presentationNoise + presentationBand,
          presentationProgress
        );
        if (presentationVisibility <= 0.001) discard;
        float presentationCrest = 1.0 - smoothstep(
          0.0,
          presentationBand * 1.8,
          abs(presentationProgress - presentationNoise)
        );
        vec3 presentationCrestColor = mix(
          vec3(0.18, 0.86, 1.0),
          vec3(0.72, 0.38, 1.0),
          presentationNoise
        );
        fragmentColor = mix(fragmentColor, presentationCrestColor, presentationCrest * 0.72);
        fragmentAlpha *= presentationVisibility;
#endif
{{VALUE_072_HEIGHTFIELDDEBUGSTATEMENTS}}
        if (material_CompositionMode > {{VALUE_092_HEIGHTFIELDWATERCOMPOSITIONMODE_ALPHABLEND_0_5}}) {
          if (coverage <= 0.001) discard;
          // Precomposed-replace writes complete C. Blend is disabled by the
          // matching material render-state binding, so B is not consumed again.
          fragmentAlpha = 1.0;
        }
        {{VALUE_093_CREATEWATERSURFACEV2RESOLVEDOUTPUTSTATEMENT_VEC4_FRAGMEN}}
      }
