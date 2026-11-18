Shader "Terrain/Terrain" {
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

      VertexShader = TerrainVertex;
      FragmentShader = TerrainFragment;

      #include "terrain/TerrainForwardPass.glsl"
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
      #include "terrain/TerrainShadow.glsl"

      struct TerrainShadowVaryings {
        vec2 sourceXZ;
        vec3 sourcePositionWS;
        float terrainValid;
      };

      TerrainShadowVaryings TerrainShadowVertex(Attributes attributes) {
        TerrainShadowVaryings varyings;
        TerrainProjectClipmapVertex clipmapVertex = terrainProjectClipmapVertexAt(attributes.POSITION);
        varyings.sourceXZ = clipmapVertex.sourceXZ;
        varyings.sourcePositionWS = clipmapVertex.positionWS;
        varyings.terrainValid = clipmapVertex.valid;
        vec3 normalWS = terrainProjectClipmapGeometryNormal(clipmapVertex);
        vec3 positionWS = clipmapVertex.positionWS;
        gl_Position = terrainProjectShadowClipPosition(applyTerrainProjectShadowBias(positionWS, normalWS));
        return varyings;
      }

      void TerrainShadowFragment(TerrainShadowVaryings varyings) {
        if (varyings.terrainValid < 0.999) discard;
        gl_FragColor = terrainProjectShadowColor();
      }
    }
  }
}
