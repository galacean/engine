Shader "Farming/PlannerLandBlend" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }

      CompareFunction material_WorldPickDepthCompare;
      Number landDepthBias;
      Number landSlopeScaledDepthBias;
      RenderQueueType renderQueueType;
      RenderQueueType = renderQueueType;
      BlendState = {
        Enabled = true;
        SourceColorBlendFactor = BlendFactor.SourceAlpha;
        DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
        SourceAlphaBlendFactor = BlendFactor.One;
        DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
      }
      DepthState = {
        CompareFunction = material_WorldPickDepthCompare;
        WriteEnabled = false;
      }
      RasterState = {
        CullMode = CullMode.Back;
        DepthBias = landDepthBias;
        SlopeScaledDepthBias = landSlopeScaledDepthBias;
      }

      VertexShader = GrassVertex;
      FragmentShader = GrassFragment;

      #define MATERIAL_GRASS_GROUND_SURFACE
      #define MATERIAL_FARM_GROUND_SURFACE
      #include "grass/GrassForwardPass.glsl"
    }
  }
}
