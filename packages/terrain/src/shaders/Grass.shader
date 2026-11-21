Shader "Terrain/Grass" {
  SubShader "Default" {
    // Intentionally omits DepthOnly to stay within mobile Hi-Z pre-pass vertex budget.
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
