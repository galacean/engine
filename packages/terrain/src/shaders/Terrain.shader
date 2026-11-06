Shader "Terrain/Terrain" {
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

      VertexShader = TerrainVertex;
      FragmentShader = TerrainFragment;

      #include "terrain/TerrainForwardPass.glsl"
    }

    Pass "ScreenSpaceReflectionSurface" {
      Tags {
        pipelineStage = "ScreenSpaceReflectionSurface",
        screenSpaceReflectionReceiver = "ColorResponseV2"
      }

      DepthState = {
        Enabled = true;
        WriteEnabled = true;
      }
      BlendState = {
        Enabled = false;
      }
      RasterState = {
        CullMode = CullMode.Back;
      }
      RenderQueueType = Opaque;

      VertexShader = TerrainScreenSpaceReflectionVertex;
      FragmentShader = TerrainScreenSpaceReflectionFragment;

      #include "terrain/TerrainScreenSpaceReflectionPass.glsl"
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

      VertexShader = TerrainShadowVertex;
      FragmentShader = TerrainShadowFragment;

      #define TERRAIN_PROJECT_SHADOW_CASTER_PASS
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #include "ShaderLibrary/Common/Attributes.glsl"
      #include "terrain/TerrainHeight.glsl"
      #include "shared/EntranceWave.glsl"
      #include "shared/Shadow.glsl"

      struct TerrainShadowVaryings {
        vec2 sourceXZ;
        vec3 sourcePositionWS;
        float terrainValid;
        #ifdef TERRAIN_PROJECT_ENTRANCE_WAVE
          float entranceSourceY;
        #endif
      };

      TerrainShadowVaryings TerrainShadowVertex(Attributes attributes) {
        TerrainShadowVaryings varyings;
        TerrainProjectClipmapVertex clipmapVertex = terrainProjectClipmapVertexAt(attributes.POSITION);
        varyings.sourceXZ = clipmapVertex.sourceXZ;
        varyings.sourcePositionWS = clipmapVertex.positionWS;
        varyings.terrainValid = clipmapVertex.valid;
        #ifdef TERRAIN_PROJECT_ENTRANCE_WAVE
          varyings.entranceSourceY = clipmapVertex.positionWS.y;
        #endif
        vec3 normalWS = terrainProjectClipmapGeometryNormal(clipmapVertex);
        vec3 positionWS = clipmapVertex.positionWS;
        #ifdef TERRAIN_PROJECT_ENTRANCE_WAVE
          positionWS = terrainProjectApplyEntranceWavePosition(positionWS);
          positionWS = terrainProjectApplyEntranceWaveHeightPosition(positionWS, varyings.entranceSourceY);
        #endif
        gl_Position = terrainProjectShadowClipPosition(applyTerrainProjectShadowBias(positionWS, normalWS));
        return varyings;
      }

      void TerrainShadowFragment(TerrainShadowVaryings varyings) {
        if (varyings.terrainValid < 0.999 || terrainProjectSolidAt(varyings.sourceXZ) < 0.5) discard;
        #ifdef TERRAIN_PROJECT_ENTRANCE_WAVE
          if (
            terrainProjectEntranceWaveReveal(varyings.sourcePositionWS) <= 0.001 ||
            terrainProjectEntranceWaveHeightReveal(varyings.entranceSourceY) <= 0.001
          ) discard;
        #endif
        gl_FragColor = terrainProjectShadowColor();
      }
    }
  }
}
