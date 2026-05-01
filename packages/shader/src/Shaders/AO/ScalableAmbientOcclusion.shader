Shader "AO/ScalableAmbientOcclusion" {
  SubShader "Default" {
    Pass "ScalableAmbientOcclusion" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      VertexShader = vert;
      FragmentShader = frag;

      #include "ShaderLibrary/Common/BlitVertex.glsl"
      #include "ShaderLibrary/AO/ScalableAmbientOcclusion.glsl"
    }

    Pass "BilateralBlur" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      VertexShader = vert;
      FragmentShader = frag;

      #include "ShaderLibrary/Common/BlitVertex.glsl"
      #include "ShaderLibrary/AO/BilateralBlur.glsl"
    }
  }
}
