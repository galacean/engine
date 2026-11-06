
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #include "ShaderLibrary/Lighting/ScreenSpaceReflection/ScreenSpaceReflection.glsl"

      vec4 scene_ElapsedTime;
      vec3 scene_WindVelocity;
      vec3 material_WindVelocity;
      float material_WindVelocityOverride;
      sampler2D material_LocalMapTexture;
      sampler2D material_SurfaceTexture;
{{VALUE_004_APPEARANCEUNIFORMS}}
      vec4 material_LocalMapDecode;
      vec4 material_WaterWorldToLocalPlanar;
      float material_TimeScale;
      float material_WaveStrength;
      float material_WavesEnabled;
      float material_MicroNormalStrength;
      float material_ShoreDampingWidth;
      float material_SurfaceTimeOverride;
      float material_MicroNormalsEnabled;
      float material_Roughness;
      float material_ScreenSpaceReflectionMode;
      float material_ScreenSpaceReflectionIntensity;
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
      struct HeightfieldScreenSpaceReflectionSurfaceOutput {
        layout(location = 0) vec4 geometry;
        layout(location = 1) vec4 responseColor;
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
        float waveOffset = 0.0;
        float tangentSlope = 0.0;
        float bitangentSlope = 0.0;
{{VALUE_029_WAVEAPPLYSTATEMENTS_WAVECOUNT}}
        vec3 computedMacroNormalWS = normalize(
          computedBaseNormalWS
            - computedBaseTangentWS * tangentSlope
            - computedBaseBitangentWS * bitangentSlope
        );
        waveOffset *= waterConnectionFacts(baseWorldPosition.xz).x;
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

      HeightfieldScreenSpaceReflectionSurfaceOutput frag(Varyings input) {
        if (waterConnectionFacts(input.worldPosition.xz).w < 0.5) discard;
        if (
          material_ScreenSpaceReflectionMode < 1.5
            || material_ScreenSpaceReflectionMode > 2.5
        ) discard;
        vec4 localMap = texture2D(material_LocalMapTexture, input.atlasUv);
        float signedDistance = (localMap.a * 2.0 - 1.0) * material_LocalMapDecode.z;
        signedDistance = waterConnectionShore(input.worldPosition.xz, signedDistance);
        if (smoothstep(-0.08, 0.08, signedDistance) <= 0.001) discard;
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
{{VALUE_033_FLOWSURFACELAYERSTATEMENTS_QUALITY}}
        float detailStrength = max(
          material_MicroNormalStrength,
          {{VALUE_034_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_MINIMUMNORMALSTREN}}
        ) * material_MicroNormalsEnabled * mix(
          {{VALUE_035_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_STILLMICRONORMALSC}},
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
{{VALUE_036_APPEARANCENORMALSTATEMENTS}}
{{VALUE_037_CREATEHEIGHTFIELDWATERRAINRIPPLENORMALSTATEMENTS_QUALITY}}
        surfaceNormalWS = waterConnectionNormal(input.worldPosition.xz, surfaceNormalWS);
        vec3 viewDirection = safeNormalize3(camera_Position - input.worldPosition, vec3(0.0, 1.0, 0.0));
        surfaceNormalWS *= step(0.0, dot(surfaceNormalWS, viewDirection)) * 2.0 - 1.0;
        vec3 viewNormal = safeNormalize3(
          mat3(camera_ViewMat) * surfaceNormalWS,
          vec3(0.0, 0.0, 1.0)
        );
        HeightfieldScreenSpaceReflectionSurfaceOutput surfaceOutput;
        surfaceOutput.geometry = packScreenSpaceReflectionSurface(
          viewNormal,
          rainRippleSurfaceRoughness,
          1.0
        );
        surfaceOutput.responseColor = vec4(vec3(material_ScreenSpaceReflectionIntensity), 1.0);
        return surfaceOutput;
      }
