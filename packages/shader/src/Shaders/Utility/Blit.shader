Shader "Utility/Blit" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }

      VertexShader = vert;
      FragmentShader = frag;

      #include "Common/Common.glsl"

      mediump sampler2D renderer_BlitTexture;
      #ifdef HAS_TEX_LOD
        float renderer_BlitMipLevel;
      #endif
      vec4 renderer_SourceScaleOffset;

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

      #ifdef HAS_TEX_LOD
        vec4 texture2DLodSRGB(sampler2D tex, vec2 uv, float lod) {
          vec4 color = texture2DLodEXT(tex, uv, lod);
          #ifdef ENGINE_NO_SRGB
            color = sRGBToLinear(color);
          #endif
          return color;
        }
      #endif

      void frag(Varyings v) {
        vec2 uv = v.v_uv;
        uv = uv * renderer_SourceScaleOffset.xy + renderer_SourceScaleOffset.zw;

        #ifdef HAS_TEX_LOD
          gl_FragColor = texture2DLodSRGB(renderer_BlitTexture, uv, renderer_BlitMipLevel);
        #else
          gl_FragColor = texture2DSRGB(renderer_BlitTexture, uv);
        #endif
      }
    }
  }
}
