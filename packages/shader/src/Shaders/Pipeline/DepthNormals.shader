Shader "Pipeline/DepthNormals" {
  SubShader "Default" {
    Pass "DepthNormals" {
      Tags { pipelineStage = "DepthNormals" }

      RenderQueueType material_DepthOnlyRenderQueue;
      CullMode rasterStateCullMode;

      DepthState = {
        Enabled = true;
        WriteEnabled = true;
        CompareFunction = CompareFunction.LessEqual;
      }

      BlendState = {
        Enabled = false;
      }

      RasterState = {
        CullMode = rasterStateCullMode;
      }

      RenderQueueType = material_DepthOnlyRenderQueue;

      VertexShader = depthNormalsVertex;
      FragmentShader = depthNormalsFragment;

      #include "ShaderLibrary/Pipeline/DepthNormals.glsl"
    }

    Pass "PBRDepthNormals" {
      Tags { pipelineStage = "DepthNormals" }

      RenderQueueType material_DepthOnlyRenderQueue;
      CullMode rasterStateCullMode;

      DepthState = {
        Enabled = true;
        WriteEnabled = true;
        CompareFunction = CompareFunction.LessEqual;
      }

      BlendState = {
        Enabled = false;
      }

      RasterState = {
        CullMode = rasterStateCullMode;
      }

      RenderQueueType = material_DepthOnlyRenderQueue;

      VertexShader = depthNormalsVertex;
      FragmentShader = depthNormalsFragment;

      #define DEPTH_NORMALS_PBR
      #include "ShaderLibrary/Pipeline/DepthNormals.glsl"
    }
  }
}
