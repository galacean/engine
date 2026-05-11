Shader "Sky/BackgroundTexture" {
  SubShader "Default" {
    Pass "Forward Pass" {
      Tags { pipelineStage = "Forward" }

      DepthState = {
        CompareFunction = CompareFunction.LessEqual;
      }

      VertexShader = BackgroundTextureVertex;
      FragmentShader = BackgroundTextureFragment;

      #include "ShaderLibrary/Common/Common.glsl"

      struct Attributes {
        vec3 POSITION;
        vec2 TEXCOORD_0;
      };

      struct Varyings {
        vec2 v_uv;
      };

      sampler2D material_BaseTexture;

      Varyings BackgroundTextureVertex(Attributes attributes) {
        Varyings varyings;
        gl_Position = vec4(attributes.POSITION, 1.0);
        gl_Position.y *= camera_ProjectionParams.x;
        varyings.v_uv = attributes.TEXCOORD_0;
        return varyings;
      }

      void BackgroundTextureFragment(Varyings varyings) {
        gl_FragColor = texture2DSRGB(material_BaseTexture, varyings.v_uv);
      }
    }
  }
}
