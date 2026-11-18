Shader "Farming/PlannerLandBlend" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }

      CompareFunction material_WorldPickDepthCompare;
      Number landDepthBias;
      Number landSlopeScaledDepthBias;
      RenderQueueType renderQueueType;
      RenderQueueType = renderQueueType;
      DepthState = {
        CompareFunction = material_WorldPickDepthCompare;
        WriteEnabled = false;
      }
      RasterState = {
        CullMode = CullMode.Off;
        DepthBias = landDepthBias;
        SlopeScaledDepthBias = landSlopeScaledDepthBias;
      }

      VertexShader = GrassVertex;
      FragmentShader = GrassFragment;

      #define MATERIAL_GRASS_GROUND_SURFACE
      #define MATERIAL_FARM_GROUND_SURFACE
      #define MATERIAL_GRASS_SHARED_COLOR_FIELD
      #define TERRAIN_PROJECT_GROUND_MATERIAL_BINDING
      #include "grass/GrassForwardPass.glsl"
    }
  }
}
