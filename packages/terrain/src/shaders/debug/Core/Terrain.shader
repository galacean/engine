Shader "Terrain/Debug/Core/Terrain" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }

      DepthState = {
        WriteEnabled = true;
      }
      RasterState = {
        CullMode = CullMode.Back;
      }
      RenderQueueType = Opaque;

      VertexShader = TerrainCoreDebugVertex;
      FragmentShader = TerrainCoreDebugFragment;

      #define TERRAIN_PROJECT_FORWARD_PASS
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #include "ShaderLibrary/Common/Attributes.glsl"
      #include "ShaderLibrary/Shadow/Shadow.glsl"

      struct Varyings {
        vec3 positionWS;
        vec2 sourceXZ;
        vec3 normalWS;
        vec4 positionCS;
        float terrainValid;
        float clipmapMorph;
        #if defined(SCENE_USE_PROBE_VOLUME) && defined(SCENE_PROBE_VOLUME_PER_VERTEX)
          vec3 probeIrradiance;
          float probeWeight;
        #endif
        #if defined(NEED_CALCULATE_SHADOWS) && (SCENE_SHADOW_CASCADED_COUNT == 1)
          vec3 shadowCoord;
        #endif
      };

      #include "ShaderLibrary/PBR/BSDF.glsl"
      #include "terrain/TerrainHeight.glsl"
      #include "terrain/TerrainEvaluation.glsl"
      #include "shared/Lighting.glsl"
      #include "debug/CoreDebug.glsl"
      #include "debug/TerrainCoreDebug.glsl"

      Varyings TerrainCoreDebugVertex(Attributes attributes) {
        Varyings varyings;
        TerrainProjectClipmapVertex clipmapVertex = terrainProjectClipmapVertexAt(attributes.POSITION);
        varyings.positionWS = clipmapVertex.positionWS;
        varyings.sourceXZ = clipmapVertex.sourceXZ;
        varyings.terrainValid = clipmapVertex.valid;
        varyings.clipmapMorph = clipmapVertex.morph;
        varyings.normalWS = terrainProjectClipmapGeometryNormal(clipmapVertex);
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

      vec3 terrainProjectTerrainSharedDebugColor(Varyings varyings, vec3 geometryNormal) {
        vec3 color = vec3(0.0);
        #ifdef MATERIAL_TERRAIN_LAYERS
          int regionIndex;
          int alphamapOffset;
          int alphamapCount;
          if (terrainProjectResolveLayerGroups(
            varyings.positionWS.xz,
            regionIndex,
            alphamapOffset,
            alphamapCount
          )) {
            for (int groupIndex = 0; groupIndex < TERRAIN_PROJECT_MAX_ALPHAMAPS_PER_REGION; groupIndex++) {
              if (groupIndex >= alphamapCount) break;
              TerrainProjectLayerBlend layerBlend;
              if (terrainProjectEvaluateLayerGroup(
                varyings.positionWS,
                regionIndex,
                alphamapOffset + groupIndex,
                layerBlend
              )) {
                float groupWeight = layerBlend.weight;
                if (
                  groupWeight > 0.0 &&
                  (groupIndex == 0 || groupWeight > TERRAIN_PROJECT_MIN_ADDITIVE_GROUP_WEIGHT)
                ) {
                  SurfaceData surfaceData = evaluateTerrainLayerSurface(varyings, geometryNormal, layerBlend);
                  TerrainProjectLightingResult lighting = evaluateTerrainProjectLighting(varyings, surfaceData);
                  color += terrainProjectCoreDebugColor(surfaceData, lighting, geometryNormal) * groupWeight;
                }
              }
            }
            return color;
          }
        #endif
        SurfaceData surfaceData = evaluateTerrainFallbackSurface(varyings, geometryNormal);
        TerrainProjectLightingResult lighting = evaluateTerrainProjectLighting(varyings, surfaceData);
        return terrainProjectCoreDebugColor(surfaceData, lighting, geometryNormal);
      }

      void TerrainCoreDebugFragment(Varyings varyings) {
        bool clipmapDebug = abs(material_DebugView - TERRAIN_PROJECT_DEBUG_CLIPMAP_LOD) < 0.5;
        if (varyings.terrainValid < 0.999 && !clipmapDebug) discard;
        float solid = varyings.terrainValid < 0.999 ? 0.0 : terrainProjectSolidAt(varyings.sourceXZ);
        if (material_DebugView != TERRAIN_PROJECT_DEBUG_HOLES && !clipmapDebug && solid < 0.5) discard;
        if (material_DebugView >= TERRAIN_PROJECT_DEBUG_SOURCE_HEIGHT - 0.5) {
          gl_FragColor = vec4(terrainProjectTerrainCoreDebugColor(varyings), 1.0);
        } else {
          vec3 geometryNormal = normalize(varyings.normalWS);
          gl_FragColor = vec4(terrainProjectTerrainSharedDebugColor(varyings, geometryNormal), 1.0);
        }
      }
    }
  }
}
