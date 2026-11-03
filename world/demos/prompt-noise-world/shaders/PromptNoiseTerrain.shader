Shader "Terrain/PromptNoiseInfinite" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }
      DepthState = { WriteEnabled = true; }
      RasterState = { CullMode = CullMode.Back; }
      RenderQueueType = Opaque;

      VertexShader = PromptNoiseTerrainVertex;
      FragmentShader = PromptNoiseTerrainFragment;

      #define TERRAIN_PROJECT_FORWARD_PASS
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #include "ShaderLibrary/Common/Attributes.glsl"
      #include "ShaderLibrary/Shadow/Shadow.glsl"

      struct Varyings {
        vec3 positionWS;
        vec2 logicalXZ;
        vec3 riverTerrainLayer;
        vec3 normalWS;
        vec4 positionCS;
        float clipmapMorph;
        #if SCENE_FOG_MODE != 0
          vec3 positionVS;
        #endif
        #if defined(SCENE_USE_PROBE_VOLUME) && defined(SCENE_PROBE_VOLUME_PER_VERTEX)
          vec3 probeIrradiance;
          float probeWeight;
        #endif
        #if defined(NEED_CALCULATE_SHADOWS) && (SCENE_SHADOW_CASCADED_COUNT == 1)
          vec3 shadowCoord;
        #endif
      };

      struct PromptNoiseLayerSample {
        vec4 albedoHeight;
        vec4 normalRoughness;
      };

      #include "ShaderLibrary/PBR/BSDF.glsl"
      #include "ShaderLibrary/Common/Fog.glsl"
      #include "PromptNoiseWorld/Height.glsl"
      #include "shared/Lighting.glsl"

      sampler2D material_RockAlbedoHeight;
      sampler2D material_RockNormalRoughness;
      sampler2D material_GrassAlbedoHeight;
      sampler2D material_GrassNormalRoughness;
      sampler2D material_MacroNoise;
      vec3 material_GrassColor;
      float material_RockUvScale;
      float material_GrassUvScale;
      float material_GrassDetilingRotation;
      float material_ProjectionThreshold;
      float material_AutoSlope;
      float material_AutoHeightReduction;
      float material_DualNear;
      float material_DualFar;
      float material_DualReduction;
      float material_TriReduction;
      float material_NormalDetailNear;
      float material_NormalDetailFar;
      vec3 material_MacroColor1;
      vec3 material_MacroColor2;
      float material_MacroSlope;
      float material_Noise1Scale;
      float material_Noise1Angle;
      vec2 material_Noise1Offset;
      float material_Noise2Scale;
      int material_ProjectionEnabled;
      int material_DualScalingEnabled;
      int material_AutoShaderEnabled;
      int material_MacroVariationEnabled;
      int material_DetilingEnabled;
      int material_DebugView;
      vec3 material_RiverbedColor;
      float material_RiverbedBlend;
      float material_WetEdgeDarkening;
      float material_WetEdgeRoughness;
      float material_ErosionGrassSuppression;

      vec2 promptNoiseRotate(vec2 value, vec2 cosineSine) {
        return vec2(
          cosineSine.x * value.x + cosineSine.y * value.y,
          cosineSine.x * value.y - cosineSine.y * value.x
        );
      }

      float promptNoiseRandomCell(vec2 cell) {
        return fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
      }

      void promptNoisePrepareMaterialCoordinates(
        vec3 baseDdx,
        vec3 baseDdy,
        vec3 terrainNormal,
        vec3 worldPosition,
        out vec2 samplePosition,
        out vec2 sampleUv,
        out vec4 derivatives,
        out mat2 projectionAlignment
      ) {
        samplePosition = worldPosition.xz;
        sampleUv = worldPosition.xz;
        derivatives = vec4(baseDdx.xz, baseDdy.xz);
        projectionAlignment = mat2(1.0);
        if (material_ProjectionEnabled != 0 && terrainNormal.y <= material_ProjectionThreshold) {
          projectionAlignment = mat2(
            vec2(terrainNormal.z, -terrainNormal.x),
            vec2(terrainNormal.x, terrainNormal.z)
          );
          vec2 projectedAxis = round(normalize(-terrainNormal.xz) * 1.3065629648763765);
          projectedAxis *= abs(projectedAxis.x) + abs(projectedAxis.y) > 1.5
            ? 0.7071067811865475
            : 1.0;
          projectedAxis = vec2(-projectedAxis.y, projectedAxis.x);
          samplePosition = floor(vec2(dot(worldPosition.xz, projectedAxis), -worldPosition.y));
          sampleUv = vec2(dot(worldPosition.xz, projectedAxis), -worldPosition.y);
          derivatives.xy = vec2(dot(baseDdx.xz, projectedAxis), -baseDdx.y);
          derivatives.zw = vec2(dot(baseDdy.xz, projectedAxis), -baseDdy.y);
        }
        if (material_DualScalingEnabled != 0) {
          samplePosition *= material_TriReduction;
          sampleUv *= material_TriReduction;
          derivatives *= material_TriReduction;
        }
      }

      void promptNoisePrepareLayer(
        float layerScale,
        float detilingRotation,
        vec2 samplePosition,
        vec2 sampleUv,
        vec4 derivatives,
        out vec2 layerUv,
        out vec2 layerCosineSine,
        out vec4 layerDerivatives
      ) {
        vec2 cell = floor(samplePosition * layerScale + vec2(0.5));
        float detiling = material_DetilingEnabled != 0 ? detilingRotation : 0.0;
        vec2 detile = (promptNoiseRandomCell(cell) * 2.0 - 1.0) *
          vec2(detiling, 0.0) * 6.283185307179586;
        layerCosineSine = vec2(cos(detile.x), sin(detile.x));
        layerUv = promptNoiseRotate(sampleUv * layerScale - cell, layerCosineSine) +
          cell + detile.y - 0.5;
        layerDerivatives = derivatives * layerScale;
        layerDerivatives.xy = promptNoiseRotate(layerDerivatives.xy, layerCosineSine);
        layerDerivatives.zw = promptNoiseRotate(layerDerivatives.zw, layerCosineSine);
      }

      PromptNoiseLayerSample promptNoiseSampleRock(
        float layerScale,
        vec2 samplePosition,
        vec2 sampleUv,
        vec4 derivatives,
        mat2 projectionAlignment,
        bool detailed
      ) {
        vec2 layerUv;
        vec2 layerCosineSine;
        vec4 layerDerivatives;
        promptNoisePrepareLayer(
          layerScale,
          0.0,
          samplePosition,
          sampleUv,
          derivatives,
          layerUv,
          layerCosineSine,
          layerDerivatives
        );
        PromptNoiseLayerSample result;
        result.albedoHeight = textureGrad(
          material_RockAlbedoHeight,
          layerUv,
          layerDerivatives.xy,
          layerDerivatives.zw
        );
        if (detailed) {
          result.normalRoughness = textureGrad(
            material_RockNormalRoughness,
            layerUv,
            layerDerivatives.xy,
            layerDerivatives.zw
          );
          result.normalRoughness.a = clamp(result.normalRoughness.a - 0.05, 0.0, 1.0);
          result.normalRoughness.xyz = result.normalRoughness.xzy * 2.0 - 1.0;
          result.normalRoughness.xz = promptNoiseRotate(
            result.normalRoughness.xz,
            layerCosineSine
          ) * projectionAlignment;
        } else {
          result.normalRoughness = vec4(0.0, 1.0, 0.0, 0.45);
        }
        return result;
      }

      PromptNoiseLayerSample promptNoiseSampleGrass(
        vec2 samplePosition,
        vec2 sampleUv,
        vec4 derivatives,
        mat2 projectionAlignment,
        bool detailed
      ) {
        vec2 layerUv;
        vec2 layerCosineSine;
        vec4 layerDerivatives;
        promptNoisePrepareLayer(
          material_GrassUvScale,
          material_GrassDetilingRotation,
          samplePosition,
          sampleUv,
          derivatives,
          layerUv,
          layerCosineSine,
          layerDerivatives
        );
        PromptNoiseLayerSample result;
        result.albedoHeight = textureGrad(
          material_GrassAlbedoHeight,
          layerUv,
          layerDerivatives.xy,
          layerDerivatives.zw
        );
        result.albedoHeight.rgb *= material_GrassColor;
        if (detailed) {
          result.normalRoughness = textureGrad(
            material_GrassNormalRoughness,
            layerUv,
            layerDerivatives.xy,
            layerDerivatives.zw
          );
          result.normalRoughness.xyz = result.normalRoughness.xzy * 2.0 - 1.0;
          result.normalRoughness.xz = promptNoiseRotate(
            result.normalRoughness.xz,
            layerCosineSine
          ) * projectionAlignment;
        } else {
          result.normalRoughness = vec4(0.0, 1.0, 0.0, 0.5);
        }
        return result;
      }

      PromptNoiseLayerSample promptNoiseSampleDualRock(
        vec2 samplePosition,
        vec2 sampleUv,
        vec4 derivatives,
        mat2 projectionAlignment,
        bool detailed,
        float cameraDistance
      ) {
        float farFactor = material_DualScalingEnabled != 0
          ? clamp(smoothstep(material_DualNear, material_DualFar, cameraDistance), 0.0, 1.0)
          : 0.0;
        if (farFactor <= 0.0) {
          return promptNoiseSampleRock(
            material_RockUvScale,
            samplePosition,
            sampleUv,
            derivatives,
            projectionAlignment,
            detailed
          );
        }
        if (farFactor >= 1.0) {
          return promptNoiseSampleRock(
            material_RockUvScale * material_DualReduction,
            samplePosition,
            sampleUv,
            derivatives,
            projectionAlignment,
            detailed
          );
        }
        PromptNoiseLayerSample nearSample = promptNoiseSampleRock(
          material_RockUvScale,
          samplePosition,
          sampleUv,
          derivatives,
          projectionAlignment,
          detailed
        );
        PromptNoiseLayerSample farSample = promptNoiseSampleRock(
          material_RockUvScale * material_DualReduction,
          samplePosition,
          sampleUv,
          derivatives,
          projectionAlignment,
          detailed
        );
        PromptNoiseLayerSample result;
        result.albedoHeight = mix(nearSample.albedoHeight, farSample.albedoHeight, farFactor);
        result.normalRoughness = mix(nearSample.normalRoughness, farSample.normalRoughness, farFactor);
        return result;
      }

      float promptNoiseGrassWeight(vec3 terrainNormal, float height) {
        if (material_AutoShaderEnabled == 0) return 1.0;
        return clamp(
          material_AutoSlope * 2.0 * (terrainNormal.y - 1.0) + 1.0 -
          material_AutoHeightReduction * 0.01 * height,
          0.0,
          1.0
        );
      }

      vec2 promptNoiseHeightBlend(
        float grassWeight,
        float rockHeight,
        float grassHeight
      ) {
        vec2 weights = vec2(1.0 - grassWeight, grassWeight);
        float maximumHeight = max(rockHeight + weights.x, grassHeight + weights.y);
        const float transition = 0.16;
        vec2 heightWeights = max(
          vec2(rockHeight, grassHeight) + weights - maximumHeight + transition,
          vec2(0.0)
        ) * weights;
        float total = heightWeights.x + heightWeights.y;
        return total > 0.000001 ? heightWeights / total : weights;
      }

      vec3 promptNoiseMacroVariation(vec2 logicalXZ, vec3 terrainNormal) {
        if (material_MacroVariationEnabled == 0) return vec3(1.0);
        vec2 noiseCosineSine = vec2(cos(material_Noise1Angle), sin(material_Noise1Angle));
        float noise1 = texture2D(
          material_MacroNoise,
          promptNoiseRotate(
            logicalXZ * material_Noise1Scale * 0.1 + material_Noise1Offset,
            noiseCosineSine
          )
        ).r;
        float noise2 = texture2D(
          material_MacroNoise,
          logicalXZ * material_Noise2Scale * 0.1
        ).r;
        vec3 variation = mix(material_MacroColor1, vec3(1.0), noise1);
        variation *= mix(material_MacroColor2, vec3(1.0), noise2);
        return mix(
          vec3(1.0),
          variation,
          clamp(terrainNormal.y + material_MacroSlope, 0.0, 1.0)
        );
      }

      vec3 promptNoiseLodColor(float lod) {
        if (lod < 0.5) return vec3(1.0, 0.2, 0.2);
        if (lod < 1.5) return vec3(1.0, 0.65, 0.1);
        if (lod < 2.5) return vec3(0.2, 1.0, 0.25);
        if (lod < 3.5) return vec3(0.1, 0.8, 1.0);
        if (lod < 4.5) return vec3(0.25, 0.35, 1.0);
        if (lod < 5.5) return vec3(0.75, 0.25, 1.0);
        return vec3(1.0, 0.25, 0.7);
      }

      SurfaceData promptNoiseBuildSurface(
        Varyings varyings,
        vec3 albedo,
        vec3 normalWS,
        float roughness,
        float ambientOcclusion
      ) {
        SurfaceData surfaceData;
        surfaceData.albedoColor = albedo;
        surfaceData.emissiveColor = vec3(0.0);
        surfaceData.metallic = 0.0;
        surfaceData.roughness = roughness;
        surfaceData.ambientOcclusion = ambientOcclusion;
        surfaceData.opacity = 1.0;
        surfaceData.IOR = 1.5;
        surfaceData.position = varyings.positionWS;
        surfaceData.positionCS = varyings.positionCS;
        surfaceData.normal = normalWS;
        #ifdef CAMERA_ORTHOGRAPHIC
          surfaceData.viewDir = -camera_Forward;
        #else
          surfaceData.viewDir = normalize(camera_Position - varyings.positionWS);
        #endif
        surfaceData.dotNV = clamp(dot(surfaceData.normal, surfaceData.viewDir), 0.0, 1.0);
        surfaceData.specularIntensity = 0.35;
        surfaceData.specularColor = vec3(1.0);
        return surfaceData;
      }

      Varyings PromptNoiseTerrainVertex(Attributes attributes) {
        Varyings varyings;
        PromptNoiseClipmapVertex vertex = promptNoiseClipmapVertexAt(attributes.POSITION);
        varyings.logicalXZ = vertex.logicalXZ;
        varyings.riverTerrainLayer = promptNoiseRiverTerrainLayer(vertex.logicalXZ);
        varyings.clipmapMorph = vertex.morph;
        varyings.normalWS = promptNoiseGeometryNormal(vertex.logicalXZ);
        varyings.positionWS = vertex.positionWS;
        varyings.positionCS = camera_VPMat * vec4(varyings.positionWS, 1.0);
        #if SCENE_FOG_MODE != 0
          varyings.positionVS = (camera_ViewMat * vec4(varyings.positionWS, 1.0)).xyz;
        #endif
        #if defined(SCENE_USE_PROBE_VOLUME) && defined(SCENE_PROBE_VOLUME_PER_VERTEX)
          vec3 probeIrradiance;
          bool hasProbe = sampleProbeVolume(
            varyings.positionWS,
            varyings.normalWS,
            normalize(camera_Position - varyings.positionWS),
            probeIrradiance
          );
          varyings.probeIrradiance = probeIrradiance;
          varyings.probeWeight = hasProbe ? 1.0 : 0.0;
        #endif
        #if defined(NEED_CALCULATE_SHADOWS) && (SCENE_SHADOW_CASCADED_COUNT == 1)
          varyings.shadowCoord = getShadowCoord(varyings.positionWS);
        #endif
        gl_Position = varyings.positionCS;
        return varyings;
      }

      void PromptNoiseTerrainFragment(Varyings varyings) {
        vec3 terrainNormal = normalize(varyings.normalWS);
        float height = varyings.positionWS.y;
        vec3 riverTerrainLayer = clamp(varyings.riverTerrainLayer, vec3(0.0), vec3(1.0));
        float grassWeight = promptNoiseGrassWeight(terrainNormal, height);
        grassWeight *= 1.0 - clamp(
          riverTerrainLayer.x * 0.88 + riverTerrainLayer.z * material_ErosionGrassSuppression,
          0.0,
          0.96
        );
        vec3 baseDdx = dFdx(varyings.positionWS);
        vec3 baseDdy = dFdy(varyings.positionWS);
        vec2 samplePosition;
        vec2 sampleUv;
        vec4 derivatives;
        mat2 projectionAlignment;
        promptNoisePrepareMaterialCoordinates(
          baseDdx,
          baseDdy,
          terrainNormal,
          varyings.positionWS,
          samplePosition,
          sampleUv,
          derivatives,
          projectionAlignment
        );
        float cameraDistance = length(varyings.positionWS - camera_Position);
        float normalDetailWeight = 1.0 - smoothstep(
          material_NormalDetailNear,
          material_NormalDetailFar,
          cameraDistance
        );
        bool detailed = normalDetailWeight > 0.0001;
        PromptNoiseLayerSample rock = promptNoiseSampleDualRock(
          samplePosition,
          sampleUv,
          derivatives,
          projectionAlignment,
          detailed,
          cameraDistance
        );
        PromptNoiseLayerSample grass = promptNoiseSampleGrass(
          samplePosition,
          sampleUv,
          derivatives,
          projectionAlignment,
          detailed
        );
        vec2 layerWeights = promptNoiseHeightBlend(
          grassWeight,
          rock.albedoHeight.a,
          grass.albedoHeight.a
        );
        vec4 albedoHeight = rock.albedoHeight * layerWeights.x +
          grass.albedoHeight * layerWeights.y;
        vec4 normalRoughness = rock.normalRoughness * layerWeights.x +
          grass.normalRoughness * layerWeights.y;
        vec4 neutralNormalRoughness = vec4(
          0.0,
          1.0,
          0.0,
          mix(0.45, 0.5, layerWeights.y)
        );
        normalRoughness = mix(neutralNormalRoughness, normalRoughness, normalDetailWeight);
        vec3 macroVariation = promptNoiseMacroVariation(varyings.logicalXZ, terrainNormal);
        vec3 albedo = albedoHeight.rgb * macroVariation;
        float riverbedBlend = clamp(
          riverTerrainLayer.x * material_RiverbedBlend + riverTerrainLayer.z * 0.24,
          0.0,
          1.0
        );
        albedo = mix(albedo, material_RiverbedColor * mix(vec3(0.82), macroVariation, 0.38), riverbedBlend);
        albedo *= 1.0 - riverTerrainLayer.y * material_WetEdgeDarkening;
        normalRoughness.a = mix(
          normalRoughness.a,
          material_WetEdgeRoughness,
          riverTerrainLayer.y
        );

        vec3 mappedNormal = terrainNormal;
        if (normalDetailWeight > 0.0001) {
          vec3 worldTangent = cross(terrainNormal, vec3(0.0, 0.0, 1.0));
          if (dot(worldTangent, worldTangent) < EPSILON) {
            worldTangent = cross(terrainNormal, vec3(0.0, 1.0, 0.0));
          }
          worldTangent = normalize(worldTangent);
          vec3 worldBitangent = normalize(cross(terrainNormal, worldTangent));
          vec3 normalMap = normalize(normalRoughness.xyz);
          vec3 detailedNormal = normalize(
            worldTangent * normalMap.x +
            terrainNormal * normalMap.y +
            worldBitangent * normalMap.z
          );
          mappedNormal = normalize(mix(terrainNormal, detailedNormal, normalDetailWeight));
        }
        float terrainAo = (1.0 - albedoHeight.a * log(0.1)) * (1.0 - normalRoughness.y);
        float ambientOcclusion = clamp(1.0 - terrainAo * 2.0, albedoHeight.a, 1.0);

        vec3 color;
        if (material_DebugView == 1) {
          color = vec3(clamp((height + 122.5) / 420.0, 0.0, 1.0));
        } else if (material_DebugView == 2) {
          color = vec3(1.0 - terrainNormal.y);
        } else if (material_DebugView == 3) {
          color = mix(vec3(0.45, 0.35, 0.3), vec3(0.18, 0.72, 0.22), grassWeight);
        } else if (material_DebugView == 4) {
          color = macroVariation;
        } else if (material_DebugView == 5) {
          color = promptNoiseLodColor(renderer_Lod) * mix(0.5, 1.0, varyings.clipmapMorph);
        } else if (material_DebugView == 6) {
          color = mappedNormal * 0.5 + 0.5;
        } else if (material_DebugView == 7) {
          SurfaceData surfaceData = promptNoiseBuildSurface(
            varyings,
            albedo,
            mappedNormal,
            clamp(normalRoughness.a, 0.0, 1.0),
            ambientOcclusion
          );
          color = vec3(evaluateTerrainProjectLighting(varyings, surfaceData).shadowAttenuation);
        } else if (material_DebugView == 8) {
          vec4 formulaMasks = promptNoiseFormulaMasks(varyings.logicalXZ);
          color = mix(formulaMasks.rgb, vec3(1.0, 0.82, 0.16), formulaMasks.a * 0.78);
        } else {
          SurfaceData surfaceData = promptNoiseBuildSurface(
            varyings,
            albedo,
            mappedNormal,
            clamp(normalRoughness.a, 0.0, 1.0),
            ambientOcclusion
          );
          TerrainProjectLightingResult lighting = evaluateTerrainProjectLighting(varyings, surfaceData);
          color = terrainProjectFinalLighting(lighting);
        }
        #if SCENE_FOG_MODE != 0
          color = fog(vec4(color, 1.0), varyings.positionVS).rgb;
        #endif
        gl_FragColor = vec4(color, 1.0);
      }
    }

    Pass "ShadowCaster" {
      Tags { pipelineStage = "ShadowCaster" }
      DepthState = { WriteEnabled = true; }
      RasterState = { CullMode = CullMode.Back; }
      RenderQueueType = Opaque;

      VertexShader = PromptNoiseShadowVertex;
      FragmentShader = PromptNoiseShadowFragment;

      #define TERRAIN_PROJECT_SHADOW_CASTER_PASS
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #include "ShaderLibrary/Common/Attributes.glsl"
      #include "PromptNoiseWorld/Height.glsl"
      #include "shared/Shadow.glsl"
      void PromptNoiseShadowVertex(Attributes attributes) {
        PromptNoiseClipmapVertex vertex = promptNoiseClipmapVertexAt(attributes.POSITION);
        vec3 normalWS = promptNoiseGeometryNormal(vertex.logicalXZ);
        gl_Position = terrainProjectShadowClipPosition(
          applyTerrainProjectShadowBias(vertex.positionWS, normalWS)
        );
      }

      void PromptNoiseShadowFragment() {
        gl_FragColor = terrainProjectShadowColor();
      }
    }
  }
}
