Shader "Terrain/Billboard" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }

      DepthState = {
        WriteEnabled = true;
      }
      RasterState = {
        CullMode = CullMode.Off;
      }
      RenderQueueType = AlphaTest;

      VertexShader = BillboardVertex;
      FragmentShader = BillboardFragment;

      #define TERRAIN_PROJECT_FORWARD_PASS
      #if defined(RENDERER_HAS_NORMAL) && defined(RENDERER_HAS_TANGENT) && defined(MATERIAL_HAS_NORMALTEXTURE)
        #define NEED_VERTEX_TANGENT
      #endif
      #ifdef MATERIAL_HAS_NORMALTEXTURE
        #define NEED_TANGENT_SPACE
      #endif

      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Fog.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
        #include "shared/AssetAssemblyAttributes.glsl"

        #include "shared/AssetAssemblyInstancing.glsl"
      #elif defined(RENDERER_BILLBOARD_INSTANCE)
        #include "billboard/BillboardInstanceAttributes.glsl"
      #else
        #include "ShaderLibrary/Common/Attributes.glsl"
      #endif
      #include "ShaderLibrary/Shadow/Shadow.glsl"

      struct Varyings {
        vec2 uv;
        vec3 positionWS;
        #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
          vec3 assetAssemblyColor;
          float assetAssemblyLodFade;
        #endif
        #ifdef RENDERER_GENERATION_REVEAL
          vec4 generationRevealData;
        #endif
        #if SCENE_FOG_MODE != 0
          vec3 positionVS;
        #endif
        vec3 normalWS;
        #ifdef NEED_VERTEX_TANGENT
          vec3 tangentWS;
          vec3 bitangentWS;
        #endif
        vec4 positionCS;
        #if defined(SCENE_USE_PROBE_VOLUME) && defined(SCENE_PROBE_VOLUME_PER_VERTEX)
          vec3 probeIrradiance;
          float probeWeight;
        #endif
        #if defined(NEED_CALCULATE_SHADOWS) && (SCENE_SHADOW_CASCADED_COUNT == 1)
          vec3 shadowCoord;
        #endif
      };

      #include "ShaderLibrary/PBR/BSDF.glsl"
      #include "billboard/BillboardEvaluation.glsl"
      #include "billboard/BillboardDeformation.glsl"
      #include "shared/LodDither.glsl"
      #include "shared/Lighting.glsl"
      #include "shared/EntranceWave.glsl"

      Varyings BillboardVertex(Attributes attributes) {
        Varyings varyings;
        vec4 positionOS = vec4(attributes.POSITION, 1.0);
        #ifdef RENDERER_HAS_NORMAL
          vec3 normalOS = attributes.NORMAL;
        #else
          vec3 normalOS = vec3(0.0, 0.0, 1.0);
        #endif
        #ifdef RENDERER_HAS_TANGENT
          vec4 tangentOS = attributes.TANGENT;
        #else
          vec4 tangentOS = vec4(1.0, 0.0, 0.0, 1.0);
        #endif
        #ifdef RENDERER_HAS_UV
          varyings.uv = attributes.TEXCOORD_0;
        #else
          varyings.uv = vec2(0.0);
        #endif

        TerrainProjectBillboardDeformation deformation = terrainProjectBillboardDeformation(
          positionOS,
          normalOS,
          tangentOS,
          attributes
        );
        #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
          varyings.assetAssemblyColor = terrainProjectAssetAssemblyColor(attributes);
          varyings.assetAssemblyLodFade = terrainProjectAssetAssemblyLodFade(attributes);
        #endif
        varyings.positionWS = deformation.positionWS;
        #ifdef RENDERER_GENERATION_REVEAL
          varyings.generationRevealData = terrainProjectGenerationRevealData(
            deformation.sourcePositionWS.y,
            attributes
          );
        #endif
        #ifdef TERRAIN_PROJECT_ENTRANCE_WAVE
          varyings.positionWS = terrainProjectApplyEntranceWavePosition(varyings.positionWS);
        #endif
        #ifdef RENDERER_GENERATION_REVEAL
          varyings.positionWS = terrainProjectApplyGenerationRevealPosition(
            varyings.positionWS,
            varyings.generationRevealData
          );
        #endif
        varyings.normalWS = deformation.normalWS;
        #ifdef NEED_VERTEX_TANGENT
          varyings.tangentWS = deformation.tangentWS.xyz;
          varyings.bitangentWS = cross(varyings.normalWS, varyings.tangentWS) * deformation.tangentWS.w;
        #endif
        #if SCENE_FOG_MODE != 0
          varyings.positionVS = (camera_ViewMat * vec4(varyings.positionWS, 1.0)).xyz;
        #endif
        varyings.positionCS = camera_VPMat * vec4(varyings.positionWS, 1.0);

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

      void BillboardFragment(Varyings varyings) {
        #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
          applyTerrainProjectInstanceLodDither(gl_FragCoord.xy, varyings.assetAssemblyLodFade);
        #else
          applyTerrainProjectLodDither(gl_FragCoord.xy);
        #endif
        #ifdef TERRAIN_PROJECT_ENTRANCE_WAVE
          if (terrainProjectEntranceWaveReveal(varyings.positionWS) <= 0.001) discard;
        #endif
        #ifdef RENDERER_GENERATION_REVEAL
          if (terrainProjectGenerationRevealAmount(varyings.generationRevealData) <= 0.001) discard;
        #endif
        SurfaceData surfaceData = evaluateBillboardMaterial(varyings);
        TerrainProjectLightingResult lighting = evaluateTerrainProjectLighting(varyings, surfaceData);
        vec4 color = vec4(terrainProjectFinalLighting(lighting), 1.0);
        #ifdef TERRAIN_PROJECT_ENTRANCE_WAVE
          color.rgb = applyTerrainProjectEntranceWave(color.rgb, varyings.positionWS);
        #endif
        #ifdef RENDERER_GENERATION_REVEAL
          color.rgb = terrainProjectApplyGenerationRevealColor(color.rgb, varyings.generationRevealData);
        #endif
        #if SCENE_FOG_MODE != 0
          color = fog(color, varyings.positionVS);
        #endif
        gl_FragColor = color;
      }
    }

    Pass "ShadowCaster" {
      Tags { pipelineStage = "ShadowCaster" }

      DepthState = {
        WriteEnabled = true;
      }
      RasterState = {
        CullMode = CullMode.Off;
      }
      RenderQueueType = AlphaTest;

      VertexShader = BillboardShadowVertex;
      FragmentShader = BillboardShadowFragment;

      #define TERRAIN_PROJECT_SHADOW_CASTER_PASS
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
        #include "shared/AssetAssemblyAttributes.glsl"

        #include "shared/AssetAssemblyInstancing.glsl"
      #elif defined(RENDERER_BILLBOARD_INSTANCE)
        #include "billboard/BillboardInstanceAttributes.glsl"
      #else
        #include "ShaderLibrary/Common/Attributes.glsl"
      #endif

      struct Varyings {
        vec2 uv;
        vec3 sourcePositionWS;
        #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
          float assetAssemblyLodFade;
        #endif
        #ifdef RENDERER_GENERATION_REVEAL
          vec4 generationRevealData;
        #endif
      };

      #include "billboard/BillboardInput.glsl"
      #include "billboard/BillboardDeformation.glsl"
      #include "shared/LodDither.glsl"
      #include "shared/EntranceWave.glsl"
      #include "shared/Shadow.glsl"

      Varyings BillboardShadowVertex(Attributes attributes) {
        Varyings varyings;
        vec4 positionOS = vec4(attributes.POSITION, 1.0);
        #ifdef RENDERER_HAS_NORMAL
          vec3 normalOS = attributes.NORMAL;
        #else
          vec3 normalOS = vec3(0.0, 0.0, 1.0);
        #endif
        #ifdef RENDERER_HAS_TANGENT
          vec4 tangentOS = attributes.TANGENT;
        #else
          vec4 tangentOS = vec4(1.0, 0.0, 0.0, 1.0);
        #endif
        #ifdef RENDERER_HAS_UV
          varyings.uv = attributes.TEXCOORD_0 * material_Tiling;
        #else
          varyings.uv = vec2(0.0);
        #endif

        TerrainProjectBillboardDeformation deformation = terrainProjectBillboardDeformation(
          positionOS,
          normalOS,
          tangentOS,
          attributes
        );
        #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
          varyings.assetAssemblyLodFade = terrainProjectAssetAssemblyLodFade(attributes);
        #endif
        varyings.sourcePositionWS = deformation.positionWS;
        #ifdef RENDERER_GENERATION_REVEAL
          varyings.generationRevealData = terrainProjectGenerationRevealData(
            deformation.sourcePositionWS.y,
            attributes
          );
        #endif
        vec3 positionWS = deformation.positionWS;
        #ifdef TERRAIN_PROJECT_ENTRANCE_WAVE
          positionWS = terrainProjectApplyEntranceWavePosition(positionWS);
        #endif
        #ifdef RENDERER_GENERATION_REVEAL
          positionWS = terrainProjectApplyGenerationRevealPosition(positionWS, varyings.generationRevealData);
        #endif
        gl_Position = terrainProjectShadowClipPosition(
          applyTerrainProjectShadowBias(positionWS, deformation.normalWS)
        );
        return varyings;
      }

      void BillboardShadowFragment(Varyings varyings) {
        #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
          applyTerrainProjectInstanceLodDither(gl_FragCoord.xy, varyings.assetAssemblyLodFade);
        #else
          applyTerrainProjectLodDither(gl_FragCoord.xy);
        #endif
        #ifdef TERRAIN_PROJECT_ENTRANCE_WAVE
          if (terrainProjectEntranceWaveReveal(varyings.sourcePositionWS) <= 0.001) discard;
        #endif
        #ifdef RENDERER_GENERATION_REVEAL
          if (terrainProjectGenerationRevealAmount(varyings.generationRevealData) <= 0.001) discard;
        #endif
        applyBillboardAlphaCutoff(sampleBillboardBaseTexture(varyings.uv).a);
        gl_FragColor = terrainProjectShadowColor();
      }
    }
  }
}
