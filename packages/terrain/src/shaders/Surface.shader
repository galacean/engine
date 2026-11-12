Shader "Terrain/Surface" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }

      CompareFunction material_WorldPickDepthCompare;
      DepthState = {
        CompareFunction = material_WorldPickDepthCompare;
        WriteEnabled = true;
      }
      RasterState = {
        CullMode = CullMode.Back;
      }
      RenderQueueType = Opaque;

      VertexShader = SurfaceVertex;
      FragmentShader = SurfaceFragment;

      #define TERRAIN_PROJECT_FORWARD_PASS
      #if defined(RENDERER_HAS_NORMAL) && defined(RENDERER_HAS_TANGENT) && \
        (defined(MATERIAL_HAS_NORMALTEXTURE) || defined(MATERIAL_ENABLE_COVERAGE))
        #define NEED_VERTEX_TANGENT
      #endif
      #if defined(MATERIAL_HAS_NORMALTEXTURE) || defined(MATERIAL_ENABLE_COVERAGE)
        #define NEED_TANGENT_SPACE
      #endif

      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Fog.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
        #include "shared/AssetAssemblyAttributes.glsl"

        #include "shared/AssetAssemblyInstancing.glsl"
        #ifdef MATERIAL_WIND_PROCEDURAL_TREE
          #include "shared/ProceduralTreeWind.glsl"
        #endif
      #else
        #include "ShaderLibrary/Common/Attributes.glsl"
        #include "ShaderLibrary/Skin/Skin.glsl"
        #include "ShaderLibrary/Skin/BlendShape.glsl"
      #endif
      #include "ShaderLibrary/Shadow/Shadow.glsl"

      #ifdef RENDERER_WORLD_PICK
        float renderer_WorldPickBase;
        float renderer_WorldPickInstanced;
      #endif
      struct Varyings {

        #ifdef RENDERER_WORLD_PICK
          float worldPickId;
        #endif
        vec2 uv;
        vec3 sourcePositionOS;
        #ifdef MATERIAL_COVERAGE_USE_LOCAL_NORMAL
          vec3 sourceNormalOS;
        #endif
        vec3 positionWS;
        #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
          vec3 assetAssemblyColor;
          float assetAssemblyLodFade;
        #endif
        #ifdef RENDERER_GENERATION_REVEAL
          vec4 generationRevealData;
          #ifdef MATERIAL_PROCEDURAL_TREE_DENSITY_TRANSITION
            vec3 treeDissolveTint;
          #endif
        #endif
        #if SCENE_FOG_MODE != 0 && !defined(MATERIAL_DISABLE_DISTANCE_FOG)
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
      #include "surface/SurfaceEvaluation.glsl"
      #include "shared/LodDither.glsl"
      #include "shared/Lighting.glsl"
      #include "shared/EntranceWave.glsl"

      Varyings SurfaceVertex(Attributes attributes) {
        Varyings varyings;
        #ifdef RENDERER_WORLD_PICK
          varyings.worldPickId = renderer_WorldPickBase + float(gl_InstanceID) * renderer_WorldPickInstanced;
        #endif
        vec4 positionOS = vec4(attributes.POSITION, 1.0);
        #ifdef RENDERER_HAS_NORMAL
          vec3 normalOS = attributes.NORMAL;
          #ifdef RENDERER_HAS_TANGENT
            vec4 tangentOS = attributes.TANGENT;
          #endif
        #else
          vec3 normalOS = vec3(0.0, 1.0, 0.0);
        #endif

        #if defined(RENDERER_HAS_BLENDSHAPE) && !defined(RENDERER_ASSET_ASSEMBLY_INSTANCE)
          calculateBlendShape(
            attributes,
            positionOS
            #ifdef RENDERER_HAS_NORMAL
              , normalOS
              #ifdef RENDERER_HAS_TANGENT
                , tangentOS
              #endif
            #endif
          );
        #endif
        #if defined(RENDERER_HAS_SKIN) && !defined(RENDERER_ASSET_ASSEMBLY_INSTANCE)
          mat4 skinMatrix = getSkinMatrix(attributes);
          positionOS = skinMatrix * positionOS;
          #ifdef RENDERER_HAS_NORMAL
            mat3 skinNormalMatrix = INVERSE_MAT(mat3(skinMatrix));
            normalOS = normalOS * skinNormalMatrix;
            #ifdef RENDERER_HAS_TANGENT
              tangentOS.xyz = tangentOS.xyz * skinNormalMatrix;
            #endif
          #endif
        #endif

        varyings.sourcePositionOS = positionOS.xyz;
        #ifdef MATERIAL_COVERAGE_USE_LOCAL_NORMAL
          varyings.sourceNormalOS = normalOS;
        #endif
        #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
          positionOS.xyz = terrainProjectAssetAssemblyPositionOS(positionOS.xyz, attributes);
          normalOS = terrainProjectAssetAssemblyNormalOS(normalOS, attributes);
          #ifdef RENDERER_HAS_TANGENT
            tangentOS.xyz = terrainProjectAssetAssemblyTangentOS(tangentOS.xyz, attributes);
          #endif
          varyings.assetAssemblyColor = terrainProjectAssetAssemblyColor(attributes);
          varyings.assetAssemblyLodFade = terrainProjectAssetAssemblyLodFade(attributes);
        #endif

        #ifdef RENDERER_HAS_UV
          varyings.uv = attributes.TEXCOORD_0;
        #else
          varyings.uv = vec2(0.0);
        #endif
        #if defined(RENDERER_PROCEDURAL_TREE_BARK_UV_SCALE) && \
          defined(RENDERER_PROCEDURAL_TREE_VARIATION_CATALOG)
          varyings.uv *= terrainProjectProceduralTreeBarkUvScaleFromInstance(attributes);
        #endif
        vec4 homogeneousPositionWS = renderer_ModelMat * positionOS;
        varyings.positionWS = homogeneousPositionWS.xyz / homogeneousPositionWS.w;
        varyings.normalWS = normalize(mat3(renderer_NormalMat) * normalOS);
        vec3 proceduralTreeTangentWS = vec3(0.0);
        #ifdef NEED_VERTEX_TANGENT
          proceduralTreeTangentWS = normalize(mat3(renderer_NormalMat) * tangentOS.xyz);
        #endif
        #ifdef MATERIAL_WIND_PROCEDURAL_TREE
          vec3 proceduralTreeOriginOS = terrainProjectAssetAssemblyOriginOS(attributes);
          vec4 homogeneousProceduralTreeOriginWS = renderer_ModelMat * vec4(proceduralTreeOriginOS, 1.0);
          vec3 proceduralTreeOriginWS =
            homogeneousProceduralTreeOriginWS.xyz / homogeneousProceduralTreeOriginWS.w;
          float proceduralTreeWindShadingResponse;
          vec3 proceduralTreeGroundWindDiagnostics;
          vec3 proceduralTreeGroundWindCarrierNormalWS;
          varyings.positionWS = terrainProjectApplyProceduralTreeWind(
            varyings.positionWS,
            proceduralTreeOriginWS,
            attributes,
            varyings.normalWS,
            proceduralTreeTangentWS,
            proceduralTreeWindShadingResponse,
            proceduralTreeGroundWindDiagnostics,
            proceduralTreeGroundWindCarrierNormalWS
          );
        #endif
        #ifdef RENDERER_GENERATION_REVEAL
          #ifdef MATERIAL_PROCEDURAL_TREE_DENSITY_TRANSITION
            varyings.treeDissolveTint = material_TreeDissolvePalette[terrainProjectProceduralTreeCatalogIndex(attributes)].rgb;
          #endif
          varyings.generationRevealData = terrainProjectGenerationRevealData(varyings.positionWS.y, attributes);
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
        #if SCENE_FOG_MODE != 0 && !defined(MATERIAL_DISABLE_DISTANCE_FOG)
          #if defined(TERRAIN_PROJECT_ENTRANCE_WAVE) || defined(RENDERER_GENERATION_REVEAL) || defined(MATERIAL_WIND_PROCEDURAL_TREE)
            varyings.positionVS = (camera_ViewMat * vec4(varyings.positionWS, 1.0)).xyz;
          #else
            varyings.positionVS = (renderer_MVMat * positionOS).xyz;
          #endif
        #endif
        #ifdef NEED_VERTEX_TANGENT
          varyings.tangentWS = proceduralTreeTangentWS;
          varyings.bitangentWS = cross(varyings.normalWS, varyings.tangentWS) * tangentOS.w;
        #endif
        #if defined(TERRAIN_PROJECT_ENTRANCE_WAVE) || defined(RENDERER_GENERATION_REVEAL) || defined(MATERIAL_WIND_PROCEDURAL_TREE)
          varyings.positionCS = camera_VPMat * vec4(varyings.positionWS, 1.0);
        #else
          varyings.positionCS = renderer_MVPMat * positionOS;
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

      void SurfaceFragment(Varyings varyings) {
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
        SurfaceData surfaceData = evaluateSurfaceMaterial(varyings, gl_FrontFacing);
        #ifdef RENDERER_WORLD_PICK
          float pickId = floor(varyings.worldPickId + 0.5);
          #ifdef RENDERER_WORLD_PICK_DEPTH
            pickId = floor(gl_FragCoord.z * 16777215.0 + 0.5);
          #endif
          gl_FragColor = vec4(mod(pickId, 256.0), mod(floor(pickId / 256.0), 256.0), floor(pickId / 65536.0), 255.0) / 255.0;
          return;
        #endif
        TerrainProjectLightingResult lighting = evaluateTerrainProjectLighting(varyings, surfaceData);
        vec4 color = vec4(terrainProjectFinalLighting(lighting), 1.0);
        #ifdef TERRAIN_PROJECT_ENTRANCE_WAVE
          color.rgb = applyTerrainProjectEntranceWave(color.rgb, varyings.positionWS);
        #endif
        #ifdef RENDERER_GENERATION_REVEAL
          #ifdef MATERIAL_PROCEDURAL_TREE_DENSITY_TRANSITION
            color.rgb = terrainProjectApplyGenerationRevealTint(color.rgb, varyings.generationRevealData, varyings.treeDissolveTint);
          #else
            color.rgb = terrainProjectApplyGenerationRevealColor(color.rgb, varyings.generationRevealData);
          #endif
        #endif
        #if SCENE_FOG_MODE != 0 && !defined(MATERIAL_DISABLE_DISTANCE_FOG)
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
        CullMode = CullMode.Back;
      }
      RenderQueueType = Opaque;

      VertexShader = SurfaceShadowVertex;
      FragmentShader = SurfaceShadowFragment;

      #define TERRAIN_PROJECT_SHADOW_CASTER_PASS
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
        #include "shared/AssetAssemblyAttributes.glsl"

        #include "shared/AssetAssemblyInstancing.glsl"
        #ifdef MATERIAL_WIND_PROCEDURAL_TREE
          #include "shared/ProceduralTreeWind.glsl"
        #endif
      #else
        #include "ShaderLibrary/Common/Attributes.glsl"
        #include "ShaderLibrary/Skin/Skin.glsl"
        #include "ShaderLibrary/Skin/BlendShape.glsl"
      #endif
      #include "shared/LodDither.glsl"
      #include "shared/EntranceWave.glsl"
      #include "shared/Shadow.glsl"

      struct SurfaceShadowVaryings {
        vec3 sourcePositionWS;
        #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
          float assetAssemblyLodFade;
        #endif
        #ifdef RENDERER_GENERATION_REVEAL
          vec4 generationRevealData;
          #ifdef MATERIAL_PROCEDURAL_TREE_DENSITY_TRANSITION
            vec3 treeDissolveTint;
          #endif
        #endif
      };

      SurfaceShadowVaryings SurfaceShadowVertex(Attributes attributes) {
        SurfaceShadowVaryings varyings;
        vec4 positionOS = vec4(attributes.POSITION, 1.0);
        #ifdef RENDERER_HAS_NORMAL
          vec3 normalOS = attributes.NORMAL;
          #ifdef RENDERER_HAS_TANGENT
            vec4 tangentOS = attributes.TANGENT;
          #endif
        #else
          vec3 normalOS = vec3(0.0, 1.0, 0.0);
        #endif

        #if defined(RENDERER_HAS_BLENDSHAPE) && !defined(RENDERER_ASSET_ASSEMBLY_INSTANCE)
          calculateBlendShape(
            attributes,
            positionOS
            #ifdef RENDERER_HAS_NORMAL
              , normalOS
              #ifdef RENDERER_HAS_TANGENT
                , tangentOS
              #endif
            #endif
          );
        #endif
        #if defined(RENDERER_HAS_SKIN) && !defined(RENDERER_ASSET_ASSEMBLY_INSTANCE)
          mat4 skinMatrix = getSkinMatrix(attributes);
          positionOS = skinMatrix * positionOS;
          #ifdef RENDERER_HAS_NORMAL
            normalOS = normalOS * INVERSE_MAT(mat3(skinMatrix));
          #endif
        #endif

        #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
          positionOS.xyz = terrainProjectAssetAssemblyPositionOS(positionOS.xyz, attributes);
          normalOS = terrainProjectAssetAssemblyNormalOS(normalOS, attributes);
          varyings.assetAssemblyLodFade = terrainProjectAssetAssemblyLodFade(attributes);
        #endif
        vec3 positionWS = (renderer_ModelMat * positionOS).xyz;
        vec3 normalWS = normalize(mat3(renderer_NormalMat) * normalOS);
        #ifdef MATERIAL_WIND_PROCEDURAL_TREE
          vec3 proceduralTreeOriginOS = terrainProjectAssetAssemblyOriginOS(attributes);
          vec3 proceduralTreeOriginWS = (renderer_ModelMat * vec4(proceduralTreeOriginOS, 1.0)).xyz;
          vec3 proceduralTreeTangentWS = vec3(0.0);
          float proceduralTreeWindShadingResponse;
          vec3 proceduralTreeGroundWindDiagnostics;
          vec3 proceduralTreeGroundWindCarrierNormalWS;
          positionWS = terrainProjectApplyProceduralTreeWind(
            positionWS,
            proceduralTreeOriginWS,
            attributes,
            normalWS,
            proceduralTreeTangentWS,
            proceduralTreeWindShadingResponse,
            proceduralTreeGroundWindDiagnostics,
            proceduralTreeGroundWindCarrierNormalWS
          );
        #endif
        varyings.sourcePositionWS = positionWS;
        #ifdef RENDERER_GENERATION_REVEAL
          #ifdef MATERIAL_PROCEDURAL_TREE_DENSITY_TRANSITION
            varyings.treeDissolveTint = material_TreeDissolvePalette[terrainProjectProceduralTreeCatalogIndex(attributes)].rgb;
          #endif
          varyings.generationRevealData = terrainProjectGenerationRevealData(positionWS.y, attributes);
        #endif
        #ifdef TERRAIN_PROJECT_ENTRANCE_WAVE
          positionWS = terrainProjectApplyEntranceWavePosition(positionWS);
        #endif
        #ifdef RENDERER_GENERATION_REVEAL
          positionWS = terrainProjectApplyGenerationRevealPosition(positionWS, varyings.generationRevealData);
        #endif
        gl_Position = terrainProjectShadowClipPosition(applyTerrainProjectShadowBias(positionWS, normalWS));
        return varyings;
      }

      void SurfaceShadowFragment(SurfaceShadowVaryings varyings) {
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
        gl_FragColor = terrainProjectShadowColor();
      }
    }
  }
}
