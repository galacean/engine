Shader "PostProcess/SunLensFlare" {
  SubShader "Default" {
    Pass "Sun Lens Flare Quads" {
      BlendState = {
        Enabled = true;
        SourceColorBlendFactor = BlendFactor.One;
        DestinationColorBlendFactor = BlendFactor.One;
        SourceAlphaBlendFactor = BlendFactor.Zero;
        DestinationAlphaBlendFactor = BlendFactor.One;
      }

      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      RasterState = {
        CullMode = CullMode.Off;
      }

      VertexShader = flareQuadVert;
      FragmentShader = flareQuadFrag;

      #include "ShaderLibrary/PostProcess/SunLensFlare.glsl"
    }
  }
}
