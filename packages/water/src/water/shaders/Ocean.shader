
Shader "{{VALUE_001_SHADER_NAME}}" {
  SubShader "Default" {
    Pass "Forward" {
      VertexShader = vert;
      FragmentShader = frag;
      Bool material_DepthWriteEnabled;
      BlendState oceanBlend {
        Enabled = true;
        SourceColorBlendFactor = BlendFactor.SourceAlpha;
        DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
        SourceAlphaBlendFactor = BlendFactor.One;
        DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
      }
      DepthState oceanDepth { WriteEnabled = material_DepthWriteEnabled; CompareFunction = CompareFunction.LessEqual; }
      RasterState oceanRaster { CullMode = CullMode.Back; }
      BlendState = oceanBlend;
      DepthState = oceanDepth;
      RasterState = oceanRaster;
      RenderQueueType = Transparent;

      #include "{{WATER_FORWARD_INCLUDE}}"
    }
  }
}