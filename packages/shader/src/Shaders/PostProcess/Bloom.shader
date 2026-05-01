Shader "PostProcess/Bloom" {
  SubShader "Default" {
    Pass "Bloom Prefilter" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      VertexShader = vert;
      FragmentShader = frag;

      #include "ShaderLibrary/Common/BlitVertex.glsl"
      #include "ShaderLibrary/PostProcess/Bloom/BloomPrefilter.glsl"
    }

    Pass "Bloom Blur Horizontal" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      VertexShader = vert;
      FragmentShader = frag;

      #include "ShaderLibrary/Common/BlitVertex.glsl"
      #include "ShaderLibrary/PostProcess/Bloom/BloomBlurH.glsl"
    }

    Pass "Bloom Blur Vertical" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      VertexShader = vert;
      FragmentShader = frag;

      #include "ShaderLibrary/Common/BlitVertex.glsl"
      #include "ShaderLibrary/PostProcess/Bloom/BloomBlurV.glsl"
    }

    Pass "Bloom Upsample" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      VertexShader = vert;
      FragmentShader = frag;

      #include "ShaderLibrary/Common/BlitVertex.glsl"
      #include "ShaderLibrary/PostProcess/Bloom/BloomUpsample.glsl"
    }
  }
}
