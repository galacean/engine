Shader "PostProcess/Bloom" {
  SubShader "Default" {
    Pass "Bloom Prefilter" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      VertexShader = vert;
      FragmentShader = frag;

      #include "ShaderLibrary/Blit/BlitVertex.glsl"
      #include "ShaderLibrary/PostProcess/Bloom/BloomPrefilter.glsl"
    }

    Pass "Bloom Downsample" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      VertexShader = vert;
      FragmentShader = frag;

      #include "ShaderLibrary/Blit/BlitVertex.glsl"
      #include "ShaderLibrary/PostProcess/Bloom/BloomDownsample.glsl"
    }

    Pass "Bloom Upsample" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      BlendState = {
        Enabled = true;
        SourceColorBlendFactor = BlendFactor.SourceAlpha;
        DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
        ColorBlendOperation = BlendOperation.Add;
        SourceAlphaBlendFactor = BlendFactor.Zero;
        DestinationAlphaBlendFactor = BlendFactor.One;
        AlphaBlendOperation = BlendOperation.Add;
      }

      VertexShader = vert;
      FragmentShader = frag;

      #include "ShaderLibrary/Blit/BlitVertex.glsl"
      #include "ShaderLibrary/PostProcess/Bloom/BloomUpsample.glsl"
    }
  }
}
