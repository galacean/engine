
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"

      mat4 camera_ViewInvMat;
      vec4 scene_ElapsedTime;
      vec4 scene_SunlightColor;
      vec3 scene_SunlightDirection;
      highp sampler2D camera_DepthTexture;
      sampler2D camera_OpaqueTexture;
      samplerCube material_ReflectionCubeTexture;
{{VALUE_002_WATER_ENVIRONMENT_REFLECTION_UNIFORM_DECLARATIONS}}
{{SHARED_SURFACE_UNIFORMS}}
{{VALUE_003_WATER_SURFACE_AMBIENT_LIGHTING_UNIFORM_DECLARATIONS}}
      sampler2D material_SmoothWavesTexture;
      sampler2D material_RoughWavesTexture;
      sampler2D material_CausticsTexture;
      sampler2D material_FoamTexture;
      sampler2D material_IntersectionNoiseTexture;
      sampler2D material_NearshoreTexture;
      vec4 material_NearshoreWorldToUv;
      vec4 material_NearshoreDecode;
      vec4 material_NearshoreOutsidePolicy;
      vec2 material_NearshoreCellSize;
      float material_WaterLevel;
      float material_SurfaceTimeOverride;
      float material_CameraFeaturesAvailable;
      float material_OceanBandlimitViewportHeight;
      vec2 material_OceanFarTransition;
      vec4 material_OceanWaveParameters;
      vec3 material_OceanWaveFadeAndTimeScale;
      vec4 material_OceanNormalParameters;
      vec4 material_OceanNormalMapping;
      float material_OceanNormalFadeEndDistance;
      vec4 material_OceanDeepColor;
      vec4 material_OceanHorizonColor;
      vec2 material_OceanFarReflectionFilter;
      float material_OceanReflectionNormalBlend;
      vec4 material_OceanSurfaceFoamParameters;
      vec4 material_OceanSurfaceFoamMapping;
      vec4 material_OceanSurfaceFoamColor;
      vec4 material_OceanIntersectionParameters;
      vec4 material_OceanIntersectionMotion;
      vec4 material_OceanIntersectionColor;
      float material_OceanIntersectionRippleStrength;
      vec4 material_OceanCausticsParameters;
      vec4 material_OceanCausticsMotion;
      vec4 material_OceanTranslucencyParameters;
      float material_OceanTranslucencyCurvatureMask;
      float renderer_OceanLod;
{{VALUE_004_CREATEOCEANSCENEFOGDECLARATIONS}}
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Lighting/VolumetricCloudShadow.glsl"

      struct Attributes { vec4 POSITION; vec2 TEXCOORD_0; };
      struct Varyings {
        vec3 worldPosition;
        vec3 macroNormalWS;
        vec3 tangentWS;
        vec3 positionVS;
        vec4 clipPosition;
        float waveOffsetY;
        float lod;
      };

{{VALUE_005_WATER_ENVIRONMENT_REFLECTION_SHADER_FUNCTIONS}}
{{VALUE_006_WATER_SURFACE_AMBIENT_LIGHTING_SHADER_FUNCTIONS}}
{{VALUE_007_CREATEWATERSPATIALFIELDSHADERDECODEFUNCTIONS}}
{{SHARED_SURFACE_FUNCTIONS}}
{{VALUE_008_OCEAN_FAR_FIELD_SHADER_FUNCTIONS}}

      vec2 safeNormalize2(vec2 value, vec2 fallbackValue) {
        float lengthSquared = dot(value, value);
        return lengthSquared > 0.00000001 ? value * inversesqrt(lengthSquared) : fallbackValue;
      }

      vec3 safeNormalize3(vec3 value, vec3 fallbackValue) {
        float lengthSquared = dot(value, value);
        return lengthSquared > 0.00000001 ? value * inversesqrt(lengthSquared) : fallbackValue;
      }

{{OCEAN_REFRACTION_POSITION_HELPERS}}
{{OCEAN_SURFACE_DETAIL_NORMAL_HELPERS}}
{{OCEAN_REFRACTION_SCREEN_HELPERS}}
{{OCEAN_SURFACE_DETAIL_UV_HELPERS}}
{{OCEAN_GEOMETRY_FUNCTIONS}}

      Varyings vert(Attributes attributes) {
        Varyings output;
        vec4 worldPosition4 = renderer_ModelMat * attributes.POSITION;
        vec2 restXZ = worldPosition4.xz;
        vec3 restWorldPosition = vec3(restXZ.x, material_WaterLevel, restXZ.y);
        vec3 cameraVector = camera_Position - restWorldPosition;
        float viewDistance = max(length(cameraVector), 0.001);
        float distanceToCamera = distance(camera_Position.xz, restXZ);
        float fadeFactor = clamp(
          (material_OceanWaveFadeAndTimeScale.y - distanceToCamera)
            / max(material_OceanWaveFadeAndTimeScale.y - material_OceanWaveFadeAndTimeScale.x, 0.0001),
          0.0,
          1.0
        );
        fadeFactor *= 1.0 - smoothstep(
          material_OceanFarTransition.x,
          material_OceanFarTransition.y,
          viewDistance
        );
        float elapsedTime = material_SurfaceTimeOverride >= 0.0
          ? material_SurfaceTimeOverride
          : scene_ElapsedTime.x;
        vec2 sourceTime = vec2(-elapsedTime) * material_OceanWaveFadeAndTimeScale.z;
        vec4 phase = vec4(
          {{VALUE_016_GLSL_WAVEKERNEL_PHASERATES_0}} * sourceTime.x,
          {{VALUE_017_GLSL_WAVEKERNEL_PHASERATES_1}} * sourceTime.y,
          {{VALUE_018_GLSL_WAVEKERNEL_PHASERATES_2}} * sourceTime.x,
          {{VALUE_019_GLSL_WAVEKERNEL_PHASERATES_3}} * sourceTime.y
        ) * material_OceanWaveParameters.z;
        vec4 amplitude = vec4({{VALUE_020_WAVEKERNEL_AMPLITUDES_MAP_GLSL_JOIN}});
        vec4 frequency = vec4({{VALUE_021_BASEFREQUENCY_MAP_GLSL_JOIN}})
          * max(1.0 - material_OceanWaveParameters.y, 0.001);
        vec4 steepness = vec4({{VALUE_022_GLSL_WAVEKERNEL_STEEPNESSMULTIPLIER}}) * material_OceanWaveParameters.w;
        vec4 directionAB = vec4({{VALUE_023_WAVEKERNEL_DIRECTIONS_SLICE_0_2_FLAT_MAP_GLSL_JOIN}});
        vec4 directionCD = vec4({{VALUE_024_WAVEKERNEL_DIRECTIONS_SLICE_2_FLAT_MAP_GLSL_JOIN}});
        vec3 offset = vec3(0.0);
        vec3 normalSum = vec3(0.0);
        vec4 waveBandlimitWeight = vec4(0.0);
        vec4 waveWavelength = oceanGeometryWaveWavelength(frequency);
        vec4 waveGridWeight = oceanGeometryWaveGridWeight(waveWavelength, attributes.TEXCOORD_0.x);

        // Preserve Ocean's inclusive i <= WaveCount loop and cumulative fade/frequency mutation.
        if (oceanMaximum4(waveGridWeight) > 0.0) {
          vec3 viewDirection = cameraVector / viewDistance;
          float projectedPixelsPerMetre = 0.5
            * max(material_OceanBandlimitViewportHeight, 1.0)
            * abs(camera_ProjMat[1][1]);
          #ifndef CAMERA_ORTHOGRAPHIC
            projectedPixelsPerMetre /= viewDistance;
          #endif
          float grazingWeight = smoothstep(
            {{VALUE_025_GLSL_BANDLIMIT_GRAZINGFADESTARTSINE}},
            {{VALUE_026_GLSL_BANDLIMIT_GRAZINGFADEENDSINE}},
            abs(viewDirection.y)
          );
{{OCEAN_WAVE_SPECTRUM}}
        }

        offset.y /= {{VALUE_028_GLSL_LOOK_WAVE_COUNT}};
        offset.xz *= {{VALUE_029_GLSL_WAVEKERNEL_HORIZONTALSCALEPERWAVEHEIGHT}} * material_OceanWaveParameters.x;
        offset.y *= material_OceanWaveParameters.x;
        offset *= waterConnectionFacts(worldPosition4.xz).x;
        worldPosition4.xyz += offset;
        worldPosition4.y += material_WaterLevel;
        vec3 macroNormal = waterConnectionNormal(worldPosition4.xz, safeNormalize3(normalSum, vec3(0.0, 1.0, 0.0)));
        vec3 tangent = safeNormalize3(vec3(1.0, -macroNormal.x / max(macroNormal.y, 0.05), 0.0), vec3(1.0, 0.0, 0.0));
        output.worldPosition = worldPosition4.xyz;
        output.macroNormalWS = macroNormal;
        output.tangentWS = tangent;
        output.positionVS = (camera_ViewMat * worldPosition4).xyz;
        output.clipPosition = camera_VPMat * worldPosition4;
        output.waveOffsetY = offset.y;
        output.lod = renderer_OceanLod;
        gl_Position = output.clipPosition;
        return output;
      }

{{OCEAN_SURFACE_DETAIL_SAMPLING_HELPERS}}


      void frag(Varyings input) {
        if (waterConnectionFacts(input.worldPosition.xz).w < 0.5) discard;
        vec2 nearshoreUv = input.worldPosition.xz * material_NearshoreWorldToUv.xy
          + material_NearshoreWorldToUv.zw;
        vec4 outsideEdges = vec4(
          1.0 - step(0.0, nearshoreUv.x),
          step(1.000001, nearshoreUv.x),
          1.0 - step(0.0, nearshoreUv.y),
          step(1.000001, nearshoreUv.y)
        );
        float outsideAtlas = max(max(outsideEdges.x, outsideEdges.y), max(outsideEdges.z, outsideEdges.w));
        float outsideWet = mix(1.0, material_NearshoreOutsidePolicy.x, outsideEdges.x)
          * mix(1.0, material_NearshoreOutsidePolicy.y, outsideEdges.y)
          * mix(1.0, material_NearshoreOutsidePolicy.z, outsideEdges.z)
          * mix(1.0, material_NearshoreOutsidePolicy.w, outsideEdges.w);
        vec4 nearshoreSample = texture2D(material_NearshoreTexture, clamp(nearshoreUv, vec2(0.0), vec2(1.0)));
        float sampledVerticalDepth = waterSpatialFieldDecodeDepth(
          nearshoreSample.b,
          max(material_NearshoreDecode.x, 0.0001)
        );
        float sampledShoreDistance = waterSpatialFieldDecodeSignedDistance(
          nearshoreSample.a,
          2.0078740157480315,
          -1.0078740157480315,
          material_NearshoreDecode.y
        );
        float verticalDepth = mix(
          sampledVerticalDepth,
          max(material_NearshoreDecode.x, 0.0001) * outsideWet,
          outsideAtlas
        );
        float shoreDistance = mix(
          sampledShoreDistance,
          mix(-material_NearshoreDecode.y, material_NearshoreDecode.y, outsideWet),
          outsideAtlas
        );
        float shoreAntialias = max(
          max(material_NearshoreCellSize.x, material_NearshoreCellSize.y) * 0.42,
          max(fwidth(shoreDistance) * 1.25, material_NearshoreDecode.y * (2.0 / 255.0))
        );
        shoreDistance = waterConnectionShore(input.worldPosition.xz, shoreDistance);
        float atlasCoverage = smoothstep(-shoreAntialias, shoreAntialias, shoreDistance);
        float coverage = mix(atlasCoverage, outsideWet, outsideAtlas);
        if (coverage <= 0.001) discard;

{{SHARED_GEOMETRY_BRIDGE}}
        float farFieldWeight = smoothstep(
          material_OceanFarTransition.x,
          material_OceanFarTransition.y,
          distance(camera_Position, input.worldPosition)
        );
        if (
          farFieldWeight >= 0.999
        ) {
          vec3 farFieldColor = oceanFarFieldRadiance(input.worldPosition);
{{VALUE_030_CREATEOCEANSCENEFOGAPPLICATION_FARFIELDCOLOR}}
          vec4 farWaterClosure = vec4(farFieldColor, coverage);
{{SHARED_FAR_OUTPUT}}
        } else {
          float elapsedTime = material_SurfaceTimeOverride >= 0.0
          ? material_SurfaceTimeOverride
          : scene_ElapsedTime.x;
        vec3 macroNormal = waterSurfaceAmplifyMacroNormalSlopes(waterSurface_macroNormalWS, material_AppearanceV2MacroNormalStrength);
        // Rebuild the detail frame around the shading normal after slope amplification.
        vec3 tangent = safeNormalize3(
          input.tangentWS - macroNormal * dot(input.tangentWS, macroNormal),
          vec3(1.0, 0.0, 0.0)
        );
        vec3 bitangent = safeNormalize3(cross(macroNormal, tangent), vec3(0.0, 0.0, 1.0));
        vec3 tangentNormal = sampleDetailNormal(input.worldPosition.xz, input.worldPosition, elapsedTime);
        vec3 detailNormal = safeNormalize3(
          tangent * tangentNormal.x + bitangent * tangentNormal.y + macroNormal * tangentNormal.z,
          macroNormal
        );
        vec3 viewDirection = safeNormalize3(camera_Position - input.worldPosition, vec3(0.0, 1.0, 0.0));
        vec2 screenUv = input.clipPosition.xy / input.clipPosition.w * 0.5 + 0.5;
        float surfaceEyeDepth = -input.positionVS.z;
        float centeredDepthRaw = texture2D(camera_DepthTexture, screenUv).r;
        float centeredEyeDepth = remapDepthBufferEyeDepth(centeredDepthRaw);
        float centeredDepthAvailable = material_CameraFeaturesAvailable
          * step(surfaceEyeDepth + 0.0001, centeredEyeDepth)
          * step(centeredDepthRaw, 0.999999);
        float centeredViewDepth = max(centeredEyeDepth - surfaceEyeDepth, 0.0) * centeredDepthAvailable;
        vec3 centeredOpaquePosition = reconstructOpaquePositionWS(screenUv, centeredEyeDepth);

        detailNormal = waterConnectionNormal(input.worldPosition.xz, detailNormal);
        vec3 cameraForwardWS = safeNormalize3(
          -camera_ViewInvMat[2].xyz,
          safeNormalize3(input.worldPosition - camera_Position, vec3(0.0, 0.0, -1.0))
        );
        vec2 refractionOffset = physicalRefractionOffset(
          screenUv,
          cameraForwardWS,
          detailNormal,
          material_RefractionEnabled * material_RefractionStrength * material_AppearanceV2RefractionUvScale
        ) / max(abs(input.clipPosition.w), 1.0);
        vec2 requestedDisplacedUv = screenUv + refractionOffset;
        float refractionScreenInterior = screenInterior(requestedDisplacedUv);
        vec2 requestedDepthUv = mix(screenUv, requestedDisplacedUv, refractionScreenInterior);
        float requestedDisplacedDepthRaw = texture2D(camera_DepthTexture, requestedDepthUv).r;
        float requestedDisplacedEyeDepth = remapDepthBufferEyeDepth(requestedDisplacedDepthRaw);
        float refractionValidity = material_CameraFeaturesAvailable
          * refractionScreenInterior
          * step(surfaceEyeDepth + 0.0001, requestedDisplacedEyeDepth)
          * step(requestedDisplacedDepthRaw, 0.999999);
        refractionOffset *= refractionValidity;
        vec2 displacedUv = screenUv + refractionOffset;
        float displacedDepthRaw = mix(centeredDepthRaw, requestedDisplacedDepthRaw, refractionValidity);
        float displacedEyeDepth = remapDepthBufferEyeDepth(displacedDepthRaw);
        float displacedDepthAvailable = material_CameraFeaturesAvailable
          * step(surfaceEyeDepth + 0.0001, displacedEyeDepth)
          * step(displacedDepthRaw, 0.999999);
        // Preserve the centered scene for boundary composition; the shared resolver
        // selects between actual centered/displaced facts after validity gating.
        vec3 centeredSceneColor = texture2D(camera_OpaqueTexture, screenUv).rgb;
        vec3 refractedSceneColor = texture2D(camera_OpaqueTexture, displacedUv).rgb;
        float fallbackViewDepth = mix(verticalDepth, centeredViewDepth, centeredDepthAvailable);
        float viewDepth = mix(
          fallbackViewDepth,
          max(displacedEyeDepth - surfaceEyeDepth, 0.0),
          displacedDepthAvailable
        );
        float sceneRayEyeScale = surfaceEyeDepth / max(length(camera_Position - input.worldPosition), 0.001);
        vec3 fieldViewDirection = viewDirection;
#ifdef CAMERA_ORTHOGRAPHIC
        sceneRayEyeScale = 1.0;
        fieldViewDirection = cameraForwardWS;
#endif
        float fallbackRayDistance = waterSurfaceDerivedSceneRayDepth(verticalDepth, waterSurface_macroNormalWS, fieldViewDirection);
        float sceneRayDepth = mix(fallbackRayDistance, viewDepth / max(sceneRayEyeScale, 0.001), max(centeredDepthAvailable, displacedDepthAvailable));
        vec3 refractedOpaquePosition = reconstructOpaquePositionWS(displacedUv, displacedEyeDepth);
        vec3 authoredOpaquePosition = input.worldPosition - vec3(0.0, verticalDepth, 0.0);
        vec3 opaquePosition = mix(authoredOpaquePosition, centeredOpaquePosition, centeredDepthAvailable);
        opaquePosition = mix(opaquePosition, refractedOpaquePosition, displacedDepthAvailable);
        float exactSurfaceNormalDepth = abs(dot(
          input.worldPosition - opaquePosition,
          normalize(waterSurface_macroNormalWS)
        ));
        float sampledSurfaceNormalDepth = mix(
          verticalDepth,
          exactSurfaceNormalDepth,
          max(centeredDepthAvailable, displacedDepthAvailable)
        );
        float grazingCorrection = pow(
          1.0 - clamp(dot(viewDirection, waterSurface_macroNormalWS), 0.0, 1.0),
          64.0
        );
        float surfaceNormalDepth = mix(sampledSurfaceNormalDepth, viewDepth, grazingCorrection);

        float centeredDepthBehind = smoothstep(0.03, 0.22, centeredViewDepth);
{{SHARED_BOUNDARY_RESPONSE}}
{{SHARED_DEPTH_RESPONSE}}
        float waterDensity = appearanceDepthTintFactor;
        vec4 baseColor = mix(material_AppearanceV2DepthShallowColor, material_AppearanceV2DepthDeepColor, waterDensity);
        float waterFog = waterDensity * baseColor.a;

        vec2 offsetVector = clamp(vec2(input.waveOffsetY) + detailNormal.xz, vec2(0.0), vec2(1.0));
        float verticalIntersectionGradient = 1.0 - clamp(
          exp(surfaceNormalDepth) / material_OceanIntersectionParameters.y,
          0.0,
          1.0
        );
        float shoreIntersectionGradient = appearanceBoundaryMask0;
        float intersectionGradient = max(verticalIntersectionGradient, shoreIntersectionGradient) * coverage;
        float intersectionDistance = clamp(
          intersectionGradient / material_OceanIntersectionParameters.z,
          0.0,
          1.0
        );
        float intersection = 0.0;
        if (material_OceanIntersectionParameters.x > 0.0) {
          if (intersectionDistance > 0.0) {
            vec2 intersectionTime = vec2(-elapsedTime) * material_OceanIntersectionMotion.x;
            vec2 intersectionUv = (
              input.worldPosition.xz + offsetVector * material_OceanIntersectionMotion.z
            ) * material_OceanIntersectionParameters.w + intersectionTime;
            float intersectionNoise = texture2D(material_IntersectionNoiseTexture, intersectionUv).r;
            float intersectionSine = sin(
              intersectionTime.y * 10.0 - intersectionGradient * material_OceanIntersectionMotion.w
            ) * material_OceanIntersectionRippleStrength;
            intersectionNoise = clamp(
              (intersectionNoise + intersectionSine) * intersectionDistance + intersectionDistance,
              0.0,
              1.0
            );
            intersection = step(material_OceanIntersectionMotion.y, intersectionNoise)
              * coverage * material_OceanIntersectionParameters.x;
          } else if (material_OceanIntersectionMotion.y <= 0.0) {
            intersection = coverage * material_OceanIntersectionParameters.x;
          }
        }

        // Non-River Ocean keeps water.slope at zero; vertex alpha is absent on this generated mesh.
        float baseFoam = clamp(material_OceanSurfaceFoamParameters.y, 0.0, 1.0);
        float foamMask = clamp(1.0 - baseFoam, 0.0, 1.0);
        vec4 foamUv = packedUv(
          input.worldPosition.xz + offsetVector * material_OceanSurfaceFoamMapping.y,
          material_OceanSurfaceFoamMapping.zw,
          vec2(-elapsedTime),
          material_OceanSurfaceFoamParameters.w,
          material_OceanSurfaceFoamParameters.z,
          material_OceanSurfaceFoamMapping.x
        );
        float foamTexture = clamp(
          texture2D(material_FoamTexture, foamUv.xy).r
            + texture2D(material_FoamTexture, foamUv.zw).r,
          0.0,
          1.0
        );
        float surfaceFoam = smoothstep(foamMask, foamMask + 1.0, foamTexture)
          * material_OceanSurfaceFoamColor.a * material_OceanSurfaceFoamParameters.x;
        float flattening = clamp(max(intersection, surfaceFoam), 0.0, 1.0);
        detailNormal = safeNormalize3(mix(detailNormal, macroNormal, flattening), macroNormal);

        float horizonFactor = pow(1.0 - clamp(dot(viewDirection, vec3(0.0, 1.0, 0.0)), 0.0, 1.0), 8.0) * material_OceanHorizonColor.a;
        vec3 lightDirectionVector = -scene_SunlightDirection;
        float sunlightAvailable = step(0.00000001, dot(lightDirectionVector, lightDirectionVector));
        vec3 lightDirection = safeNormalize3(lightDirectionVector, vec3(0.0, 1.0, 0.0));
        vec3 unshadowedSunlightColor = max(scene_SunlightColor.rgb, vec3(0.0)) * sunlightAvailable;
        float cloudShadowAttenuation = sampleVolumetricCloudShadow(input.worldPosition);
        vec3 sunlightColor = unshadowedSunlightColor * cloudShadowAttenuation;
        vec3 diffuseNormal = safeNormalize3(
          mix(macroNormal, detailNormal, material_OceanNormalParameters.x),
          macroNormal
        );
        vec3 ambientDiffuse = waterSurfaceAmbientDiffuseRadiance(diffuseNormal);
        WaterSurfaceResolvedLightingV2 lighting = waterSurfaceCreateResolvedLightingV2(ambientDiffuse);
        lighting = waterSurfaceAccumulateDirectLightingV2(lighting, sunlightColor,
          clamp(dot(diffuseNormal, viewDirection), 0.0, 1.0), max(dot(diffuseNormal, lightDirection), 0.0),
          0.0, 0.0, 0.02, material_Roughness, 3.0, 0.0);
        vec3 diffuseLighting = lighting.diffuseRadiance;

        vec3 reflectionNormal = safeNormalize3(mix(macroNormal, detailNormal, material_OceanReflectionNormalBlend), macroNormal);
        vec3 analyticReflection = waterSurfaceResolveAnalyticReflectionFallbackV2(reflectionNormal.y, material_Roughness, 1.0);
        vec3 reflectionDirection = reflect(-viewDirection, reflectionNormal);
        float reflectionNormalDotView = clamp(dot(reflectionNormal, viewDirection), 0.0, 1.0);
        float reflectionSamplingRoughness = material_Roughness;
        if (farFieldWeight > 0.0) {
          // Converge the sampling facts before blending the remaining near-only
          // depth/foam/transmission contributions into the far closure.
          reflectionDirection = safeNormalize3(mix(
            reflectionDirection, oceanFarReflectionDirection(viewDirection), farFieldWeight
          ), vec3(0.0, 1.0, 0.0));
          reflectionNormalDotView = mix(
            reflectionNormalDotView, oceanFarReflectionNormalDotView(viewDirection), farFieldWeight
          );
          reflectionSamplingRoughness = mix(material_Roughness, material_OceanFarReflectionFilter.x, farFieldWeight);
        }
        vec3 environmentReflection;
        float environmentValidity;
        waterSurfaceSampleRawEnvironmentReflectionV2(reflectionDirection, waterSurface_positionWS, reflectionSamplingRoughness, environmentReflection, environmentValidity);
        vec3 sunReflection = waterSurfaceDirectionalHighlightV2(
          sunlightColor, lightDirection, viewDirection, macroNormal, detailNormal,
          material_AppearanceV2DirectionalHighlightDistortion, material_AppearanceV2DirectionalHighlightExponent,
          material_AppearanceV2DirectionalHighlightStrength, material_AppearanceV2DirectionalHighlightSharp
        );
        float edgeFade = clamp(surfaceNormalDepth / 0.187, 0.0, 1.0);
        float causticsMask = clamp(
          (1.0 - waterFog) - intersection - surfaceFoam,
          0.0,
          1.0
        ) * coverage;
        float mainLightIntensity = dot(unshadowedSunlightColor, vec3(0.3, 0.59, 0.11));
        float causticsWeight = causticsMask * material_OceanCausticsParameters.y
          * mainLightIntensity * cloudShadowAttenuation * material_OceanCausticsParameters.x;
        vec3 caustics = vec3(0.0);
        if (causticsWeight > 0.0) {
          vec2 causticsTime = vec2(-elapsedTime) * material_OceanCausticsMotion.x;
          vec2 causticsBase = opaquePosition.xz
            + mix(macroNormal, detailNormal, material_OceanCausticsParameters.w).xz;
          vec3 causticsA = texture2D(
            material_CausticsTexture,
            causticsBase * material_OceanCausticsMotion.y + causticsTime
          ).rgb;
          vec3 causticsB = texture2D(
            material_CausticsTexture,
            causticsBase * material_OceanCausticsMotion.y * 0.8 - causticsTime
          ).rgb;
          caustics = min(causticsA, causticsB) * 2.0;
          caustics = mix(caustics.rrr, caustics, material_OceanCausticsParameters.z) * causticsWeight;
        }

        vec3 translucencyRadiance = waterSurfaceBoundedTranslucency(
          material_AppearanceV2DepthShallowColor.rgb, sunlightColor, lightDirection, viewDirection,
          safeNormalize3(macroNormal + detailNormal * 0.1, macroNormal),
          material_OceanTranslucencyParameters.y, material_OceanTranslucencyParameters.z,
          material_OceanTranslucencyParameters.w, material_OceanTranslucencyCurvatureMask,
          clamp(waterFog + edgeFade, 0.0, 1.0) * material_OceanTranslucencyParameters.x
        );
        WaterSurfaceRawRefractionFactsV2 rawRefractionFacts;
        rawRefractionFacts.centeredSceneSample = centeredSceneColor;
        rawRefractionFacts.displacedSceneSample = refractedSceneColor;
        rawRefractionFacts.displacedSampleValidity = refractionValidity;
        rawRefractionFacts.depthWeight = 1.0 - waterFog;
        rawRefractionFacts.shoreValidity = edgeFade;
        rawRefractionFacts.coverage = waterSurface_coverage;
        WaterSurfaceRawReflectionFactsV2 rawReflectionFacts;
        rawReflectionFacts.analyticSample = analyticReflection;
        rawReflectionFacts.environmentSample = environmentReflection;
        rawReflectionFacts.environmentValidity = environmentValidity;
        rawReflectionFacts.ssrPremultipliedSample = vec3(0.0);
        rawReflectionFacts.ssrValidity = 0.0;
        WaterSurfaceRawFoamFactsV2 rawFoamFacts;
        rawFoamFacts.surfaceSignal = surfaceFoam;
        rawFoamFacts.shoreSignal = intersection;
        rawFoamFacts.crestSignal = 0.0;
        rawFoamFacts.currentSignal = 0.0;
        rawFoamFacts.wakeSignal = 0.0;
        rawFoamFacts.contactSignal = 0.0;
        rawFoamFacts.localSignal = 0.0;
        rawFoamFacts.motionScale = 1.0;
        rawFoamFacts.enabled = material_OceanFoamEnabled;
        WaterSurfaceRawContributionPolicyV2 rawContributionPolicy;
        rawContributionPolicy.primaryColorClosureModel = 3.0;
        rawContributionPolicy.refractionEnabled = material_RefractionEnabled;
        rawContributionPolicy.clarity = 1.0;
        rawContributionPolicy.boundaryRefractionSuppression = appearanceBoundaryRefractionSuppression;
        rawContributionPolicy.reflectionSource = 1.0;
        rawContributionPolicy.ssrCompositeIntensity = 0.0;
        rawContributionPolicy.foamIntensity = material_OceanFoamIntensity;
        WaterSurfaceResolvedRawContributionsV2 resolvedContributions = waterSurfaceResolveRawContributionsV2(rawRefractionFacts, rawReflectionFacts, waterSurfaceResolveRawFoamWeightV2(rawFoamFacts, rawContributionPolicy), rawContributionPolicy);
        WaterSurfaceFinalClosureV2Input closureInput;
        closureInput.additionalTransmissionRadiance = (caustics + translucencyRadiance) * waterConnectionFacts(input.worldPosition.xz).x;
        closureInput.primarySceneColor = resolvedContributions.refractionSceneColor;
        closureInput.surfaceColor = mix(material_AppearanceV2DepthShallowColor.rgb, material_OceanHorizonColor.rgb, horizonFactor);
        closureInput.depthColor = mix(appearanceDepthTintColor, material_OceanHorizonColor.rgb, horizonFactor);
        closureInput.depthFactor = appearanceDepthTintFactor;
        closureInput.diffuseLighting = diffuseLighting;
        closureInput.primaryColorClosureModel = 3.0;
        closureInput.absorptionCoefficient = material_AbsorptionCoefficient;
        closureInput.scatteringColor = material_ScatteringColor;
        closureInput.scatteringCoefficient = material_ScatteringCoefficient;
        closureInput.opticalDepth = min(viewDepth, material_MaximumSurfaceOpticalDistance);
        closureInput.refractionColor = resolvedContributions.refractionSceneColor;
        closureInput.refractionWeight = resolvedContributions.refractionWeight;
        closureInput.reflectionRadiance = resolvedContributions.reflectionRadiance;
        closureInput.fresnelF0 = pow((material_IndexOfRefraction - 1.0) / (material_IndexOfRefraction + 1.0), 2.0);
        closureInput.perceptualRoughness = effectiveSurfaceRoughness;
        closureInput.normalDotView = reflectionNormalDotView;
        closureInput.transmissionFresnelWeight = 1.0;
        closureInput.reflectionIntensity = material_ReflectionIntensity;
        closureInput.directSpecularRadiance = sunReflection;
        closureInput.boundaryColor = appearanceBoundaryColor;
        closureInput.foamColor = mix(material_OceanSurfaceFoamColor.rgb, material_OceanIntersectionColor.rgb, intersection);
        closureInput.foamWeight = resolvedContributions.foamWeight;
        closureInput.baseAlpha = 1.0;
        closureInput.clarity = 1.0;
        closureInput.coastalAlpha = edgeFade * appearanceCoastalAlpha;
        closureInput.coastalAlphaWeight = 1.0;
        closureInput.coverage = waterSurface_coverage;
        closureInput.compositionSceneColor = centeredSceneColor;
        closureInput.precomposedReplace = 1.0;
        #ifdef MATERIAL_WATER_CONNECTIONS
        // Both sides approach clear, flat water before their authored optical response resumes.
        float connectionWeight = waterConnectionFacts(input.worldPosition.xz).x;
        closureInput.depthFactor *= connectionWeight;
        closureInput.opticalDepth *= connectionWeight;
        closureInput.directSpecularRadiance *= connectionWeight;
        closureInput.perceptualRoughness = mix(0.1, closureInput.perceptualRoughness, connectionWeight);
#endif
        vec4 resolvedWaterClosure = waterSurfaceEvaluateFinalClosureV2(closureInput, resolvedContributions.foamWeight, baseColor.a);
        vec3 finalColor = resolvedWaterClosure.rgb;
        float finalAlpha = resolvedWaterClosure.a;

        if (farFieldWeight > 0.0) {
          finalColor = mix(finalColor, oceanFarFieldRadiance(input.worldPosition), farFieldWeight);
          finalAlpha = mix(finalAlpha, coverage, farFieldWeight);
        }

{{VALUE_031_CREATEOCEANSCENEFOGAPPLICATION_FINALCOLOR}}
          resolvedWaterClosure = vec4(finalColor, finalAlpha);
{{SHARED_RESOLVED_OUTPUT}}
        }
      }
