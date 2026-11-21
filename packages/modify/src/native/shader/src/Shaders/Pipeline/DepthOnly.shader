Shader "Pipeline/DepthOnly" {
  SubShader "Default" {
    Pass "DepthOnly" {
      Tags { pipelineStage = "DepthOnly" }

      RenderQueueType material_DepthOnlyRenderQueue;
      CullMode rasterStateCullMode;

      RasterState = {
        CullMode = rasterStateCullMode;
      }

      RenderQueueType = material_DepthOnlyRenderQueue;

      VertexShader = vert;
      FragmentShader = frag;

      #include "ShaderLibrary/Pipeline/DepthOnlyPass.glsl"
    }

    Pass "DepthOnlyVertexColor" {
      Tags { pipelineStage = "DepthOnly" }

      RenderQueueType material_DepthOnlyRenderQueue;
      CullMode rasterStateCullMode;

      RasterState = {
        CullMode = rasterStateCullMode;
      }

      RenderQueueType = material_DepthOnlyRenderQueue;

      VertexShader = vert;
      FragmentShader = frag;

      #define DEPTH_ONLY_USE_VERTEX_ALPHA
      #include "ShaderLibrary/Pipeline/DepthOnlyPass.glsl"
    }
  }
}
