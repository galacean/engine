Shader "2D/Text" {
  SubShader "Default" {
    Pass "Default" {
      Tags { pipelineStage = "Forward" }

      BlendState = {
        Enabled = true;
        SourceColorBlendFactor = BlendFactor.SourceAlpha;
        DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
        SourceAlphaBlendFactor = BlendFactor.One;
        DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
        ColorBlendOperation = BlendOperation.Add;
        AlphaBlendOperation = BlendOperation.Add;
      }
      DepthState = {
        WriteEnabled = false;
      }
      RasterState = {
        CullMode = CullMode.Off;
      }
      RenderQueueType = RenderQueueType.Transparent;

      VertexShader = TextVertex;
      FragmentShader = TextFragment;

      struct a2v {
        vec3 POSITION;
        vec2 TEXCOORD_0;
        vec4 COLOR_0;
      };

      struct v2f {
        vec2 v_uv;
        vec4 v_color;
      };

      mat4 renderer_MVPMat;
      sampler2D renderElement_TextTexture;

      v2f TextVertex(a2v attr) {
        v2f v;
        gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0);
        v.v_uv = attr.TEXCOORD_0;
        v.v_color = attr.COLOR_0;
        return v;
      }

      void TextFragment(v2f v) {
        vec4 texColor = texture2D(renderElement_TextTexture, v.v_uv);
        #ifdef GRAPHICS_API_WEBGL2
          float coverage = texColor.r;
        #else
          float coverage = texColor.a;
        #endif
        gl_FragColor = vec4(v.v_color.rgb, v.v_color.a * coverage);
      }
    }
  }
}
