
Shader "{{VALUE_001_SHADERNAME}}" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward", screenSpaceReflectionTransparentSample = "SampleV1" }
      Bool depthWriteEnabled;
      BlendState customBlendState {
        Enabled = true;
        SourceColorBlendFactor = BlendFactor.SourceAlpha;
        DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
        SourceAlphaBlendFactor = BlendFactor.One;
        DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
      }
      DepthState customDepthState {
        WriteEnabled = depthWriteEnabled;
        CompareFunction = CompareFunction.LessEqual;
      }
      RasterState customRasterState { CullMode = CullMode.Off; }
      BlendState = customBlendState;
      DepthState = customDepthState;
      RasterState = customRasterState;
      RenderQueueType = Transparent;

      VertexShader = vert;
      FragmentShader = frag;
      #include "{{WATER_FORWARD_INCLUDE}}"
    }
    Pass "SSR Contribution Color" {
      Tags { pipelineStage = "ScreenSpaceReflectionContributionColor", screenSpaceReflectionContribution = "ColorDepthV1" }
      Bool depthWriteEnabled;
      BlendState customBlendState {
        Enabled = true;
        SourceColorBlendFactor = BlendFactor.SourceAlpha;
        DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
        SourceAlphaBlendFactor = BlendFactor.One;
        DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
      }
      DepthState customDepthState {
        WriteEnabled = depthWriteEnabled;
        CompareFunction = CompareFunction.LessEqual;
      }
      RasterState customRasterState { CullMode = CullMode.Off; }
      BlendState = customBlendState;
      DepthState = customDepthState;
      RasterState = customRasterState;
      RenderQueueType = Transparent;

      VertexShader = vert;
      FragmentShader = frag;
      #define SSR_CONTRIBUTION_CAPTURE
      #include "{{WATER_FORWARD_INCLUDE}}"
    }
    Pass "SSR Contribution Depth" {
      Tags { pipelineStage = "ScreenSpaceReflectionContributionDepth", screenSpaceReflectionContribution = "ColorDepthV1" }
      Bool depthWriteEnabled;
      BlendState customBlendState {
        ColorWriteMask = ColorWriteMask.None;
        Enabled = true;
        SourceColorBlendFactor = BlendFactor.SourceAlpha;
        DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
        SourceAlphaBlendFactor = BlendFactor.One;
        DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
      }
      DepthState customDepthState {
        WriteEnabled = true;
        CompareFunction = CompareFunction.LessEqual;
      }
      RasterState customRasterState { CullMode = CullMode.Off; }
      BlendState = customBlendState;
      DepthState = customDepthState;
      RasterState = customRasterState;
      RenderQueueType = Transparent;

      VertexShader = vert;
      FragmentShader = frag;
      #define SSR_CONTRIBUTION_CAPTURE
      #define SSR_CONTRIBUTION_DEPTH
      #include "{{WATER_FORWARD_INCLUDE}}"
    }
{{VALUE_181_CREATERIVERSCREENSPACEREFLECTIONSURFACEPASS}}
  }
}
