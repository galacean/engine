Shader "2D/Sprite" {
  SubShader "Default" {
    Pass "Default" {
      Tags { pipelineStage = "Forward" }

      BlendState = {
        Enabled = true;
        SourceColorBlendFactor = BlendFactor.SourceAlpha;
        DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
        SourceAlphaBlendFactor = BlendFactor.One;
        DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
      }
      DepthState = {
        WriteEnabled = false;
      }
      RasterState = {
        CullMode = CullMode.Off;
      }
      RenderQueueType = Transparent;

      VertexShader = SpriteVertex;
      FragmentShader = SpriteFragment;

      #include "ShaderLibrary/Common/Common.glsl"

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
      sampler2D renderer_SpriteTexture;

      v2f SpriteVertex(a2v attr) {
        v2f v;
        gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0);
        v.v_uv = attr.TEXCOORD_0;
        v.v_color = attr.COLOR_0;
        return v;
      }

      void SpriteFragment(v2f v) {
        vec4 baseColor = texture2DSRGB(renderer_SpriteTexture, v.v_uv);
        gl_FragColor = baseColor * v.v_color;
      }
    }
  }
}
