Shader "Terrain/Grass" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }

      CompareFunction material_WorldPickDepthCompare;
      DepthState = {
        CompareFunction = material_WorldPickDepthCompare;
        WriteEnabled = true;
      }
      RasterState = {
        CullMode = CullMode.Off;
      }

      VertexShader = GrassVertex;
      FragmentShader = GrassFragment;

      #include "grass/GrassForwardPass.glsl"
    }
  }
}
