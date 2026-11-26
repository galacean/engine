Shader "Terrain/Surface" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }

      CompareFunction material_WorldPickDepthCompare;
      DepthState = {
        CompareFunction = material_WorldPickDepthCompare;
        WriteEnabled = true;
      }
      #ifdef MATERIAL_SURFACE_DOUBLE_SIDED
        RasterState = { CullMode = CullMode.Off; }
      #else
        RasterState = { CullMode = CullMode.Back; }
      #endif
      RenderQueueType = Opaque;

      VertexShader = SurfaceVertex;
      FragmentShader = SurfaceFragment;

      #define TERRAIN_PROJECT_FORWARD_PASS
      #ifndef RENDERER_WORLD_PICK
        #define TERRAIN_PROJECT_VERTEX_CLOUD_SHADOW
      #endif
      #if defined(RENDERER_HAS_NORMAL) && defined(RENDERER_HAS_TANGENT) && \
        ((defined(MATERIAL_HAS_NORMALTEXTURE) && !defined(MATERIAL_WORLD_NORMAL)) || defined(MATERIAL_ENABLE_COVERAGE))
        #define NEED_VERTEX_TANGENT
      #endif
      #if (defined(MATERIAL_HAS_NORMALTEXTURE) && !defined(MATERIAL_WORLD_NORMAL)) || defined(MATERIAL_ENABLE_COVERAGE)
        #define NEED_TANGENT_SPACE
      #endif

      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Fog.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
        #include "shared/AssetAssemblyAttributes.glsl"

        #include "shared/AssetAssemblyInstancing.glsl"
        #if defined(MATERIAL_WIND_PROCEDURAL_TREE) && defined(RENDERER_ASSET_ASSEMBLY_INSTANCE)
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
        float sourcePositionOSY;
        #ifdef MATERIAL_COVERAGE_VERTEX_MASK
          vec4 coverageColor;
        #endif
        #ifdef MATERIAL_COVERAGE_USE_LOCAL_NORMAL
          vec3 sourceNormalOS;
        #endif
        vec3 positionWS;
        #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
          vec3 assetAssemblyColor;
          vec4 plantPigment;
          #ifdef RENDERER_LOD_DITHER
            float assetAssemblyLodFade;
          #endif
        #endif
        #ifdef RENDERER_GENERATION_REVEAL
          vec4 generationRevealData;
          #if defined(MATERIAL_PROCEDURAL_TREE_DENSITY_TRANSITION) && defined(RENDERER_PROCEDURAL_TREE_VARIATION_CATALOG) && defined(RENDERER_ASSET_ASSEMBLY_INSTANCE)
            vec3 treeDissolveTint;
          #endif
        #endif
        #if SCENE_FOG_MODE != 0 && !defined(MATERIAL_DISABLE_DISTANCE_FOG)
          vec3 positionVS;
        #endif
        vec3 normalWS;
        #ifdef NEED_VERTEX_TANGENT
          vec4 tangentWS;
        #endif
        #ifdef TERRAIN_PROJECT_VERTEX_CLOUD_SHADOW
          float cloudShadow;
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
          #if defined(RENDERER_HAS_TANGENT) && defined(RENDERER_HAS_NORMAL)
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
              #if defined(RENDERER_HAS_TANGENT) && defined(RENDERER_HAS_NORMAL)
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
            #if defined(RENDERER_HAS_TANGENT) && defined(RENDERER_HAS_NORMAL)
              tangentOS.xyz = tangentOS.xyz * skinNormalMatrix;
            #endif
          #endif
        #endif

        varyings.sourcePositionOSY = positionOS.y;
        #ifdef MATERIAL_COVERAGE_USE_LOCAL_NORMAL
          varyings.sourceNormalOS = normalOS;
        #endif
        #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
          positionOS.xyz = terrainProjectAssetAssemblyPositionOS(positionOS.xyz, attributes);
          normalOS = terrainProjectAssetAssemblyNormalOS(normalOS, attributes);
          #if defined(RENDERER_HAS_TANGENT) && defined(RENDERER_HAS_NORMAL)
            tangentOS.xyz = terrainProjectAssetAssemblyTangentOS(tangentOS.xyz, attributes);
          #endif
          varyings.assetAssemblyColor = terrainProjectAssetAssemblyColor(attributes);
          varyings.plantPigment = terrainProjectPlantPigment(attributes);
          #ifdef RENDERER_LOD_DITHER
            varyings.assetAssemblyLodFade = terrainProjectAssetAssemblyLodFade(attributes);
          #endif
        #endif

        #ifdef RENDERER_HAS_UV
          varyings.uv = attributes.TEXCOORD_0;
        #else
          varyings.uv = vec2(0.0);
        #endif
        #ifdef MATERIAL_COVERAGE_VERTEX_MASK
          #ifdef RENDERER_ENABLE_VERTEXCOLOR
            varyings.coverageColor = attributes.COLOR_0;
          #else
            varyings.coverageColor = vec4(0.0);
          #endif
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
        #if defined(MATERIAL_WIND_PROCEDURAL_TREE) && defined(RENDERER_ASSET_ASSEMBLY_INSTANCE)
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
          #if defined(MATERIAL_PROCEDURAL_TREE_DENSITY_TRANSITION) && defined(RENDERER_PROCEDURAL_TREE_VARIATION_CATALOG) && defined(RENDERER_ASSET_ASSEMBLY_INSTANCE)
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
          varyings.tangentWS = vec4(proceduralTreeTangentWS, tangentOS.w);
        #endif
        #ifdef TERRAIN_PROJECT_VERTEX_CLOUD_SHADOW
          varyings.cloudShadow = sampleVolumetricCloudShadow(varyings.positionWS);
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
        #if defined(RENDERER_ASSET_ASSEMBLY_INSTANCE) && defined(RENDERER_LOD_DITHER)
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
        #ifdef TERRAIN_PROJECT_VERTEX_CLOUD_SHADOW
          float shadowAttenuation = sampleTerrainProjectShadow(varyings) * varyings.cloudShadow;
          TerrainProjectLightingResult lighting = evaluateTerrainProjectLightingWithShadow(varyings, surfaceData, shadowAttenuation);
        #else
          TerrainProjectLightingResult lighting = evaluateTerrainProjectLighting(varyings, surfaceData);
        #endif
        vec4 color = vec4(terrainProjectFinalLighting(lighting), 1.0);
        #ifdef TERRAIN_PROJECT_ENTRANCE_WAVE
          color.rgb = applyTerrainProjectEntranceWave(color.rgb, varyings.positionWS);
        #endif
        #ifdef RENDERER_GENERATION_REVEAL
          #if defined(MATERIAL_PROCEDURAL_TREE_DENSITY_TRANSITION) && defined(RENDERER_PROCEDURAL_TREE_VARIATION_CATALOG) && defined(RENDERER_ASSET_ASSEMBLY_INSTANCE)
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
      #ifdef MATERIAL_SURFACE_DOUBLE_SIDED
        RasterState = { CullMode = CullMode.Off; }
      #else
        RasterState = { CullMode = CullMode.Back; }
      #endif
      RenderQueueType = Opaque;

      VertexShader = SurfaceShadowVertex;
      FragmentShader = SurfaceShadowFragment;

      #define TERRAIN_PROJECT_SHADOW_CASTER_PASS
      #include "surface/SurfaceDepthShadowPass.glsl"
    }

    Pass "DepthOnly" {
      Tags { pipelineStage = "DepthOnly" }

      DepthState = {
        WriteEnabled = true;
      }
      #ifdef MATERIAL_SURFACE_DOUBLE_SIDED
        RasterState = { CullMode = CullMode.Off; }
      #else
        RasterState = { CullMode = CullMode.Back; }
      #endif
      RenderQueueType = Opaque;

      VertexShader = SurfaceDepthOnlyVertex;
      FragmentShader = SurfaceDepthOnlyFragment;

      #define TERRAIN_PROJECT_DEPTH_ONLY_PASS
      #include "surface/SurfaceDepthShadowPass.glsl"
    }
  }
}
