
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #include "ShaderLibrary/Lighting/ScreenSpaceReflection/ScreenSpaceReflectionCommon.glsl"

      vec4 scene_ElapsedTime;
      vec3 scene_WindVelocity;
      vec3 material_WindVelocity;
      float material_WindVelocityOverride;
      sampler2D material_LocalMapTexture;
{{VALUE_004_APPEARANCEUNIFORMS}}
      vec4 material_LocalMapDecode;
      vec4 material_WaterWorldToLocalPlanar;
      float material_TimeScale;
      float material_WaveStrength;
      float material_WavesEnabled;
      float material_ShoreDampingWidth;
      float material_SurfaceTimeOverride;
      float material_MicroNormalsEnabled;
      float material_Roughness;
      float material_ScreenSpaceReflectionIntensity;
      vec4 camera_SSRParams;
#ifdef MATERIAL_WATER_PRESENTATION_REVEAL
      float material_PresentationRevealProgress;
      float material_PresentationRevealBand;
      vec2 material_PresentationRevealRepeat;
#endif
#if {{SSR_WAVE_COUNT}} > 0
      vec4 material_WaveA0;
      vec4 material_WaveB0;
      vec4 material_WaveA1;
      vec4 material_WaveB1;
#endif
#if {{SSR_WAVE_COUNT}} > 2
      vec4 material_WaveA2;
      vec4 material_WaveB2;
      vec4 material_WaveA3;
      vec4 material_WaveB3;
      vec4 material_WaveA4;
      vec4 material_WaveB4;
      vec4 material_WaveA5;
      vec4 material_WaveB5;
#endif
#if {{SSR_WAVE_COUNT}} > 6
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
        vec3 macroNormalWS;
        vec3 baseNormalWS;
        vec3 tangentWS;
        vec2 atlasUv;
        float waveOffset;
      };
      struct HeightfieldSSRReceiverOutput {
        layout(location = 0) vec4 normalRoughness;
        layout(location = 1) vec4 receiverDepth;
      };

{{VALUE_007_HEIGHTFIELD_WATER_PLANAR_TRANSFORM_SHADER_FUNCTIONS}}

{{VALUE_008_HEIGHTFIELD_WATER_RAIN_RIPPLE_SHADER_FUNCTIONS}}
{{VALUE_009_CREATEWATERSURFACEAPPEARANCESHADERFUNCTIONS}}
{{VALUE_010_CREATEWATERSURFACEAPPEARANCEV2SHADERFUNCTIONS_APPEARANCE}}
{{HEIGHTFIELD_GEOMETRY_FUNCTIONS}}

      Varyings vert(Attributes attr) {
        Varyings varyings;
        vec4 baseWorldPosition = renderer_ModelMat * attr.POSITION;
        vec3 computedBaseNormalWS = normalize(mat3(renderer_ModelMat) * attr.NORMAL);
        vec3 computedBaseTangentWS = normalize(mat3(renderer_ModelMat) * attr.TANGENT.xyz);
        vec3 computedBaseBitangentWS = normalize(
          cross(computedBaseNormalWS, computedBaseTangentWS) * attr.TANGENT.w
        );
        float waveOffset = 0.0;
        float tangentSlope = 0.0;
        float bitangentSlope = 0.0;
#if {{SSR_WAVE_COUNT}} > 0
        vec4 localMap = texture2D(material_LocalMapTexture, attr.TEXCOORD_0);
        vec2 flowXZ = (localMap.rg * 2.0 - 1.0) * material_LocalMapDecode.x;
        float signedDistance = (localMap.a * 2.0 - 1.0) * material_LocalMapDecode.z;
        signedDistance = waterConnectionShore(baseWorldPosition.xz, signedDistance);
        float shoreDamping = smoothstep(0.0, max(material_ShoreDampingWidth, 0.0001), signedDistance);
        float flowSpeed = length(flowXZ);
        float flowWeight = smoothstep(
          {{VALUE_024_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_MINIMUMFLOWSPEED}},
          {{VALUE_025_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_MAXIMUMFLOWSPEED_0}},
          flowSpeed
        );
        vec2 flowDirection = safeNormalize2(flowXZ, vec2(-0.36, -0.9329523));
        float macroFlowAlignment = flowWeight * {{VALUE_026_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_MACROFLOWALIGNMENT}};
        float macroAmplitudeScale = mix(
          {{VALUE_027_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_STILLMACROAMPLITUD}},
          1.0,
          flowWeight
        );
{{VALUE_029_WAVEAPPLYSTATEMENTS_WAVECOUNT}}
        waveOffset *= waterConnectionFacts(baseWorldPosition.xz).x;
#endif
        vec3 computedMacroNormalWS = normalize(
          computedBaseNormalWS
            - computedBaseTangentWS * tangentSlope
            - computedBaseBitangentWS * bitangentSlope
        );
        vec4 localPosition = attr.POSITION + vec4(attr.NORMAL * waveOffset, 0.0);
        gl_Position = renderer_MVPMat * localPosition;
        varyings.worldPosition = baseWorldPosition.xyz + computedBaseNormalWS * waveOffset;
        varyings.objectPosition = attr.POSITION.xyz;
        varyings.meshUv = attr.TEXCOORD_0;
        varyings.macroNormalWS = computedMacroNormalWS;
        varyings.baseNormalWS = computedBaseNormalWS;
        varyings.tangentWS = computedBaseTangentWS;
        varyings.atlasUv = attr.TEXCOORD_0;
        varyings.waveOffset = waveOffset;
        return varyings;
      }

      HeightfieldSSRReceiverOutput frag(Varyings input) {
        if (material_ScreenSpaceReflectionIntensity <= 0.0) discard;
        vec4 localMap = texture2D(material_LocalMapTexture, input.atlasUv);
        float signedDistance = (localMap.a * 2.0 - 1.0) * material_LocalMapDecode.z;
        signedDistance = waterConnectionShore(input.worldPosition.xz, signedDistance);
        // Keep the shoreline transition wider than both one screen-space
        // derivative and one RGBA8 signed-distance decode step, matching ForwardPass
        // and computing derivatives before any per-fragment discard.
        #ifdef HAS_DERIVATIVES
          float coverageHalfWidth = max(
            0.08,
            max(
              fwidth(signedDistance) * 1.25,
              material_LocalMapDecode.z * (2.0 / 255.0)
            )
          );
        #else
          float coverageHalfWidth = max(0.08, material_LocalMapDecode.z * (2.0 / 255.0));
        #endif
        if (waterConnectionFacts(input.worldPosition.xz).w < 0.5) discard;
        if (smoothstep(-coverageHalfWidth, coverageHalfWidth, signedDistance) <= 0.001) discard;
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
#endif
        float elapsedTime = surfaceTime();
        vec2 flowXZ = (localMap.rg * 2.0 - 1.0) * material_LocalMapDecode.x;
        float flowSpeed = length(flowXZ);
        float flowWeight = smoothstep(
          {{VALUE_030_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_MINIMUMFLOWSPEED}},
          {{VALUE_031_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_MAXIMUMFLOWSPEED_0}},
          flowSpeed
        );
        float sceneWindSpeed = length(waterWindVelocity().xz);
        vec2 stillWaterDirection = sceneWindSpeed > 0.0001
          ? waterWindVelocity().xz / sceneWindSpeed
          : vec2(-0.36, -0.9329523);
        vec2 flowDirection = safeNormalize2(
          mix(
            stillWaterDirection,
            safeNormalize2(flowXZ, stillWaterDirection),
            flowWeight * {{VALUE_032_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_FLOWINGDIRECTIONWE}}
          ),
          stillWaterDirection
        );
        vec3 baseWorldPosition = input.worldPosition - input.baseNormalWS * input.waveOffset;
{{SURFACE_NORMAL_STATEMENTS}}
        if (rainRippleSurfaceRoughness >= camera_SSRParams.y) discard;
        vec3 viewDirection = safeNormalize3(camera_Position - input.worldPosition, vec3(0.0, 1.0, 0.0));
        surfaceNormalWS *= step(0.0, dot(surfaceNormalWS, viewDirection)) * 2.0 - 1.0;
        HeightfieldSSRReceiverOutput ssrOutput;
        ssrOutput.normalRoughness = packSSRNormalRoughness(surfaceNormalWS, rainRippleSurfaceRoughness);
        ssrOutput.receiverDepth = encodeSSRDepth(remapDepthBufferEyeDepth(gl_FragCoord.z), camera_ProjectionParams.z);
        return ssrOutput;
      }
