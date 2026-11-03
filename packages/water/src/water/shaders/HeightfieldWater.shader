
Shader "AIWorld/HeightfieldWater{{VALUE_001_SURFACEAPPEARANCENAME}}{{VALUE_002_DEPTHSOURCENAME}}{{VALUE_003_QUALITYNAME}}{{VALUE_004_WAVECOUNT}}" {
  SubShader "Default" {
    Pass "Forward" {
      Bool blendEnabled;
      Bool depthWriteEnabled;
      BlendState customBlendState {
        Enabled = blendEnabled;
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
{{VALUE_094_SCREENSPACEREFLECTIONSURFACEPASS_QUALITY_WAVECOUNT_SURFA}}
  }
}
