Shader "PostProcess/Bloom" {
  SubShader "Default" {
    Pass "Bloom Prefilter" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      VertexShader = vert;
      FragmentShader = frag;

      #include "Common/BlitVertex.glsl"
      #include "PostProcess/Bloom/BloomPrefilter.glsl"
    }

    Pass "Bloom Blur Horizontal" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      VertexShader = vert;
      FragmentShader = frag;

      #include "Common/BlitVertex.glsl"
      #include "PostProcess/Bloom/BloomBlurH.glsl"
    }

    Pass "Bloom Blur Vertical" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      VertexShader = vert;
      FragmentShader = frag;

      #include "Common/BlitVertex.glsl"
      #include "PostProcess/Bloom/BloomBlurV.glsl"
    }

    Pass "Bloom Upsample" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      VertexShader = vert;
      FragmentShader = frag;

      #include "Common/BlitVertex.glsl"
      #include "PostProcess/Bloom/BloomUpsample.glsl"
    }
  }
}
