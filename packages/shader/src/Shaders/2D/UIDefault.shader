Shader "2D/UIDefault" {
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

      VertexShader = vert;
      FragmentShader = frag;

      #include "Common/Common.glsl"

      mat4 renderer_MVPMat;
      sampler2D renderer_UITexture;

      struct Attributes {
          vec3 POSITION;
          vec2 TEXCOORD_0;
          vec4 COLOR_0;
      };

      struct Varyings {
          vec2 v_uv;
          vec4 v_color;
      };

      Varyings vert(Attributes attr) {
          Varyings v;

          gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0);
          v.v_uv = attr.TEXCOORD_0;
          v.v_color = attr.COLOR_0;

          return v;
      }

      void frag(Varyings v) {
          vec4 baseColor = texture2DSRGB(renderer_UITexture, v.v_uv);
          vec4 finalColor = baseColor * v.v_color;

          #ifdef ENGINE_SHOULD_SRGB_CORRECT
              finalColor = outputSRGBCorrection(finalColor);
          #endif

          gl_FragColor = finalColor;
      }
    }
  }
}
