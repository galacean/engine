
Shader "{{VALUE_001_SHADER_NAME}}" {
  SubShader "Default" {
    Pass "Forward" {
      Bool material_DepthWriteEnabled;
      BlendState farBlend {
        Enabled = true;
        SourceColorBlendFactor = BlendFactor.SourceAlpha;
        DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
        SourceAlphaBlendFactor = BlendFactor.One;
        DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
      }
      DepthState farDepth {
        Enabled = true;
        WriteEnabled = material_DepthWriteEnabled;
        CompareFunction = CompareFunction.LessEqual;
      }
      RasterState farRaster { CullMode = CullMode.Back; }
      BlendState = farBlend;
      DepthState = farDepth;
      RasterState = farRaster;
      RenderQueueType = Transparent;

      VertexShader = vert;
      FragmentShader = frag;
      #include "{{WATER_FORWARD_INCLUDE}}"
    }
  }
}
