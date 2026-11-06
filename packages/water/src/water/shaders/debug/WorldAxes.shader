
Shader "{{SHADER_NAME}}" {
  SubShader "Default" {
    Pass "Forward" {
      BlendState customBlendState {
        Enabled = true;
        SourceColorBlendFactor = BlendFactor.SourceAlpha;
        DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
        SourceAlphaBlendFactor = BlendFactor.One;
        DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
      }

      DepthState customDepthState {
        Enabled = true;
        WriteEnabled = false;
        CompareFunction = CompareFunction.Always;
      }

      RasterState customRasterState {
        CullMode = CullMode.Off;
      }

      BlendState = customBlendState;
      DepthState = customDepthState;
      RasterState = customRasterState;
      RenderQueueType = Transparent;

      mat4 renderer_MVPMat;
      vec4 material_BaseColor;

      struct Attributes {
        vec4 POSITION;
      };

      VertexShader = vert;
      FragmentShader = frag;

      void vert(Attributes attr) {
        gl_Position = renderer_MVPMat * attr.POSITION;
      }

      void frag() {
        gl_FragColor = material_BaseColor;
      }
    }
  }
}
