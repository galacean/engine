
      mat4 renderer_MVPMat;
      mat4 renderer_ModelMat;
      mat4 renderer_NormalMat;
      mat4 camera_ProjMat;
      mat4 camera_ViewMat;
      mat4 camera_ViewInvMat;
      vec3 camera_Position;
      vec4 scene_ElapsedTime;
      vec3 scene_WindVelocity;
{{AMBIENT_UNIFORMS}}
      vec4 scene_SunlightColor;
      vec3 scene_SunlightDirection;
      vec4 camera_DepthBufferParams;
      vec4 camera_ProjectionParams;
      highp sampler2D camera_DepthTexture;
      sampler2D camera_OpaqueTexture;
      sampler2D material_SurfaceNormalTexture;
      sampler2D material_RiverFoamTexture;
#if {{VALUE_003_USE_LOCAL_MAP}}
      sampler2D material_LocalMapTexture;
      vec4 renderer_LocalMapBodyToUv;
      vec4 renderer_LocalMapBodyOrigin;
      vec4 renderer_LocalMapUvRect;
      float renderer_LocalMapConfluence;
#endif

      vec4 material_BaseColor;
      vec4 material_FoamColor;
      float material_FlowSpeed;
      vec4 material_FlowNormalOffsets;
      vec4 material_FlowFoamOffsets;
      float material_FoamIntensity;
      float material_Clarity;
      float material_SurfaceSeed;
      vec4 material_SurfaceDomainOffsets;
      float material_SurfaceWarpOffset;
      float material_SurfaceMaxDisplacement;
      float material_SurfaceLengthScale;
      float material_ShoreDampingWidth;
      float material_SurfaceTurbulence;
      float material_CrestIntensity;
      float material_FlowNormalStrength;
      float material_MacroDisplacementEnabled;
      float material_MicroSurfaceEnabled;
      float material_SurfaceTimeOverride;
      float material_RefractionEnabled;
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
{{VALUE_004_WATER_ENVIRONMENT_REFLECTION_UNIFORM_DECLARATIONS}}
{{SURFACE_APPEARANCE_UNIFORMS}}
      #include "ShaderLibrary/Lighting/VolumetricCloudShadow.glsl"

      struct Attributes {
        vec4 POSITION;
        vec3 NORMAL;
        vec4 TANGENT;
        vec4 COLOR_0;
        vec2 TEXCOORD_0;
        vec2 TEXCOORD_1;
        vec2 TEXCOORD_2;
        vec2 TEXCOORD_3;
        vec2 TEXCOORD_4;
        vec2 TEXCOORD_5;
      };
      struct Varyings {
        vec2 worldXZ;
        vec2 worldFlow;
        vec2 motionCoordinates;
        float riverHalfWidth;
        float localFlowSpeed;
        float macroHeight;
        float surfaceEyeDepth;
        float authoredDepth;
        vec3 worldPosition;
        vec3 macroNormalWS;
        vec3 objectPosition;
        vec2 meshUv;
        vec3 tangentWS;
        vec4 clipPosition;
      };

{{AMBIENT_FUNCTIONS}}
      float saturate(float value) { return clamp(value, 0.0, 1.0); }
{{VALUE_006_WATER_ENVIRONMENT_REFLECTION_SHADER_FUNCTIONS}}
{{VALUE_007_ASSEMBLY_SHAREDFUNCTIONSOURCE}}
{{SURFACE_NORMAL_FUNCTIONS}}
{{FORWARD_APPEARANCE_FUNCTIONS}}
{{VALUE_010_CREATERIVERAPPEARANCEPATTERNFUNCTIONS_APPEARANCE}}
{{VALUE_011_RIVER_GEOMETRY_MODULE}}
      float remapDepthBufferEyeDepth(float depth) {
        #ifdef CAMERA_ORTHOGRAPHIC
          return camera_ProjectionParams.y + (camera_ProjectionParams.z - camera_ProjectionParams.y) * depth;
        #else
          return 1.0 / (camera_DepthBufferParams.z * depth + camera_DepthBufferParams.w);
        #endif
      }
{{REFRACTION_FUNCTIONS}}
      Varyings vert(Attributes attr) {
        Varyings output;
        RiverGeometryVertex geometry = evaluateRiverGeometry(attr);
        gl_Position = geometry.clipPosition;
        output.worldXZ = geometry.worldPosition.xz;
        output.worldFlow = geometry.worldFlow;
        output.motionCoordinates = attr.TEXCOORD_2;
        output.riverHalfWidth = attr.TEXCOORD_3.x;
        output.localFlowSpeed = attr.TEXCOORD_1.x;
        output.macroHeight = geometry.macroHeight;
        output.surfaceEyeDepth = -(camera_ViewMat * geometry.worldPosition).z;
        output.authoredDepth = attr.TEXCOORD_3.y;
        output.worldPosition = geometry.worldPosition.xyz;
        output.macroNormalWS = geometry.macroNormalWS;
        output.objectPosition = geometry.localPosition.xyz;
        output.meshUv = attr.TEXCOORD_0;
        output.tangentWS = geometry.worldTangent;
        output.clipPosition = geometry.clipPosition;
        return output;
      }

      void frag(Varyings input) {
        if (waterConnectionFacts(input.worldPosition.xz).w < 0.5) discard;
        // Evaluate shore coverage from interpolated coordinates, independent of tessellation.
        float physicalShoreDistance = waterConnectionShore(input.worldPosition.xz, input.riverHalfWidth - abs(input.motionCoordinates.x));
        float shoreDamping = smoothstep(0.0, material_ShoreDampingWidth, physicalShoreDistance);
        float elapsedTime = surfaceTime();
        float clarity = saturate(material_Clarity);
        vec2 screenUv = (input.clipPosition.xy / input.clipPosition.w) * 0.5 + 0.5;
{{DEPTH_FIELD_MODULE}}
        float opticalDepth = clamp(sampledOpticalDepth, 0.0, max(material_MaximumSurfaceOpticalDistance, 0.0));
        {{VALUE_074_LOCALSAMPLING}}
{{SURFACE_NORMAL_STATEMENTS}}
{{SURFACE_ROUGHNESS_STATEMENTS}}
        float slopeMask = riverSlopeMask(input.macroNormalWS);
        float crestMask = slopeMask;
        float normalDotView = saturate(dot(surfaceNormalWS, viewDirection));
        float fresnelF0 = clamp(material_FresnelF0, 0.0, 1.0);
        vec3 sunlightDirectionVector = -scene_SunlightDirection;
        float sunlightDirectionLengthSquared = dot(sunlightDirectionVector, sunlightDirectionVector);
        float sunlightAvailable = step(0.000001, sunlightDirectionLengthSquared);
        vec3 lightDirection = sunlightDirectionVector / max(sqrt(sunlightDirectionLengthSquared), 0.000001);
        float directShadow = 1.0;
        vec3 sunlightColor = max(scene_SunlightColor.rgb, vec3(0.0)) * directShadow
          * sunlightAvailable
          * sampleVolumetricCloudShadow(input.worldPosition);
        vec3 halfDirection = safeNormalize3(viewDirection + lightDirection, lightDirection);
        float normalDotLight = saturate(dot(surfaceNormalWS, lightDirection));
        float normalDotHalf = saturate(dot(surfaceNormalWS, halfDirection));
        float lightDotHalf = saturate(dot(lightDirection, halfDirection));
        float distanceToBank = max(0.0, input.riverHalfWidth - abs(input.motionCoordinates.x));
        float shoreEnvelope = 1.0 - smoothstep(
          0.0,
          material_ShoreDampingWidth * {{VALUE_129_GLSL_RIVER_SURFACE_SHADER_TUNING_SHOREFOAMWIDTHSCALE}},
          distanceToBank
        );
        // The reference uses separate regular/slope samples and an additive dissolve mask.
        // Foam texture pixels are linear, matching Unity's sRGB texture decoding.
        float transportGate = step(0.0001, input.localFlowSpeed);
        float foamSlopeMask = saturate(slopeMask * 3.0);
        float regularFoam = 0.0;
        float slopeFoam = 0.0;
#ifdef MATERIAL_RIVER_FOAM
        vec2 foamSourceUv = riverSourceUv(input.motionCoordinates, input.riverHalfWidth);
        foamSourceUv.x += dot(surfaceNormalWS, input.tangentWS) * 0.1;
        vec4 foamUv = riverPackedUv(foamSourceUv, vec2(0.5, 1.0), material_FlowFoamOffsets.xy * transportGate);
        regularFoam = texture2D(material_RiverFoamTexture, foamUv.xy).r
          + texture2D(material_RiverFoamTexture, foamUv.zw).r;
        vec4 slopeFoamUv = riverPackedUv(foamSourceUv, vec2(0.5, 0.5), material_FlowFoamOffsets.xz * transportGate);
        slopeFoam = texture2D(material_RiverFoamTexture, slopeFoamUv.xy).r
          + texture2D(material_RiverFoamTexture, slopeFoamUv.zw).r;
#endif
        regularFoam = saturate(regularFoam);
        slopeFoam = saturate(slopeFoam);
        float foamNoise = mix(regularFoam, slopeFoam, foamSlopeMask);
        float foamBreakup = smoothstep(0.25, 0.8, foamNoise);
        float foamThreshold = 1.0 - foamSlopeMask;
        float crestFoam = smoothstep(foamThreshold, foamThreshold + 1.0, foamNoise) * shoreDamping;
        float shoreFoam = shoreEnvelope * foamBreakup * 0.42;
        float currentFoam = 0.0;
        float localConfluenceFoam = localFoamSource * (1.0 - obstacleRegionWeight) * foamBreakup * 0.6;
        float localWakeFoam = localFoamSource * obstacleRegionWeight * foamBreakup;
        float obstacleEdge = 1.0 - smoothstep(0.0, 0.5, abs(localSignedDistance));
        float obstacleEdgeFoam = obstacleEdge * obstacleRegionWeight * mix(0.25, 0.85, foamBreakup);
        // from raw Render Contract inputs by the shared Closure.
        vec3 color = material_BaseColor.rgb;
        vec3 macroNormalVS = normalize(mat3(camera_ViewMat) * input.macroNormalWS);
        vec3 surfaceNormalVS = normalize(mat3(camera_ViewMat) * surfaceNormalWS);
#if {{REFRACTION_NORMAL_SOURCE}} == 2
        vec2 refractionNormalDelta = appearanceLayerNormal0.xy;
#elif {{REFRACTION_NORMAL_SOURCE}} == 1
        vec2 refractionNormalDelta = appearanceNormalTS.xy;
#else
        vec2 refractionNormalDelta = surfaceNormalVS.xy - macroNormalVS.xy;
#endif
        float refractionDepthWeight = smoothstep(
          {{VALUE_163_GLSL_RIVER_SURFACE_SHADER_TUNING_REFRACTIONDEPTHSTART}},
          {{VALUE_164_GLSL_RIVER_SURFACE_SHADER_TUNING_REFRACTIONDEPTHEND}},
          opticalDepth
        );
        vec2 displacedScreenUv = screenUv
          + refractionNormalDelta
            * {{VALUE_165_WATER_SURFACE_APPEARANCE_V2_SHADER_PROPERTY_REFRACTIONUV}}
            * max(material_RefractionStrength, 0.0)

#if {{REFRACTION_SHIFTED_DEPTH}} == 0
            * refractionDepthWeight * shoreDamping
#endif
            ;
        float refractionScreenInterior = step(0.002, displacedScreenUv.x)
          * step(displacedScreenUv.x, 0.998)
          * step(0.002, displacedScreenUv.y)
          * step(displacedScreenUv.y, 0.998);
        vec2 refractedScreenUv = clamp(displacedScreenUv, vec2(0.002), vec2(0.998));
        float refractedSceneEyeDepth = remapDepthBufferEyeDepth(
          texture2D(camera_DepthTexture, refractedScreenUv).r
        );
        float refractedOpticalDepth = max(refractedSceneEyeDepth - input.surfaceEyeDepth, 0.0);
        float refractionDepthTolerance = max(
          {{VALUE_166_GLSL_RIVER_SURFACE_SHADER_TUNING_REFRACTIONDEPTHTOLERANC}},
          opticalDepth * {{VALUE_167_GLSL_RIVER_SURFACE_SHADER_TUNING_REFRACTIONDEPTHTOLERANC}}
        );
        float refractionDepthContinuity = 1.0 - smoothstep(
          refractionDepthTolerance,
          refractionDepthTolerance * 3.0 + 0.2,
          abs(refractedSceneEyeDepth - sceneEyeDepth)
        );
        float refractedGeometryBehindSurface = smoothstep(0.03, 0.22, refractedOpticalDepth);
        float refractionSampleValidity = refractionScreenInterior

#if {{REFRACTION_SHIFTED_DEPTH}} == 0
          * refractionDepthContinuity
#endif
          * refractedGeometryBehindSurface;
        vec3 centeredSceneColor = texture2D(camera_OpaqueTexture, screenUv).rgb;
        vec3 displacedSceneColor = texture2D(camera_OpaqueTexture, refractedScreenUv).rgb;
        // Boundary masks use centered fields: refraction suppression must not depend on
        // the optical path that it is about to select. Depth tint uses the selected path below.
        float centeredDepthBehind = smoothstep(0.03, 0.22, sampledOpticalDepth);
{{SURFACE_BOUNDARY_STATEMENTS}}
        float refractionSampleWeight = refractionSampleValidity;
        vec3 rawAnalyticReflectionSample = waterSurfaceResolveAnalyticReflectionFallbackV2(
          surfaceNormalWS.y,
          effectiveSurfaceRoughness,
          1.0
        );
        vec3 rawEnvironmentReflectionSample;
        float rawEnvironmentReflectionValidity;
        waterSurfaceSampleRawEnvironmentReflectionV2(
          reflect(-viewDirection, surfaceNormalWS),
          input.worldPosition,
          effectiveSurfaceRoughness,
          rawEnvironmentReflectionSample,
          rawEnvironmentReflectionValidity
        );
        vec3 rawSsrReflectionPremultipliedSample = vec3(0.0);
        float rawSsrReflectionValidity = 0.0;
        if (
          material_ReflectionSource > 2.5 &&
          effectiveSurfaceRoughness < camera_ScreenSpaceReflectionMaxRoughness
        ) {
          vec4 ssrReflection = texture2D(camera_ScreenSpaceReflectionTexture, screenUv);
          float ssrGlobalIntensity = saturate(camera_ScreenSpaceReflectionIntensity) * waterConnectionFacts(input.worldPosition.xz).y;
          rawSsrReflectionPremultipliedSample = ssrReflection.rgb * ssrGlobalIntensity;
          rawSsrReflectionValidity = saturate(
            ssrReflection.a * ssrGlobalIntensity
          );
        }
        float reflectionIntensity = max(material_ReflectionIntensity, 0.0);

{{VALUE_179_ASSEMBLY_GEOMETRYBRIDGESOURCE}}
        {{VALUE_180_CREATERIVERFINALOUTPUTSTATEMENTS_APPEARANCE}}
      }
