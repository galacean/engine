Shader "Lighting/ScalableAmbientOcclusion" {
  SubShader "Default" {
    Pass "ScalableAmbientOcclusion" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      VertexShader = vert;
      FragmentShader = frag;

      #include "ShaderLibrary/Blit/BlitVertex.glsl"
      #include "ShaderLibrary/Lighting/AmbientOcclusion/ScalableAmbientOcclusion.glsl"
    }

    Pass "BilateralBlur" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      VertexShader = vert;
      FragmentShader = frag;

      #include "ShaderLibrary/Blit/BlitVertex.glsl"
      #include "ShaderLibrary/Lighting/AmbientOcclusion/BilateralBlur.glsl"
    }
  }
}
