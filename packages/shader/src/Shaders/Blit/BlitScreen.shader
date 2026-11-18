Shader "Blit/BlitScreen" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }

      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      VertexShader = vert;
      FragmentShader = frag;

      #include "ShaderLibrary/Common/Common.glsl"

      mediump sampler2D renderer_BlitTexture;
        float renderer_BlitMipLevel;

      struct Attributes {
        vec4 POSITION_UV;
      };

      struct Varyings {
        vec2 v_uv;
      };

      Varyings vert(Attributes attr) {
        Varyings v;
        gl_Position = vec4(attr.POSITION_UV.xy, 0.0, 1.0);
        v.v_uv = attr.POSITION_UV.zw;
        return v;
      }

        vec4 texture2DLodSRGB(sampler2D tex, vec2 uv, float lod) {
          vec4 color = texture2DLodEXT(tex, uv, lod);
          return color;
        }

      void frag(Varyings v) {
        vec2 uv = v.v_uv;
        // Screen uv is flipped
        uv.y = 1.0 - uv.y;

          gl_FragColor = texture2DLodSRGB(renderer_BlitTexture, uv, renderer_BlitMipLevel);

        // Color space in screen is in gamma space but without sRGB texture, so convert to linear space
        gl_FragColor = sRGBToLinear(gl_FragColor);
      }
    }
  }
}
