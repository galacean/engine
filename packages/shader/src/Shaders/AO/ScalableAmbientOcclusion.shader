Shader "AO/ScalableAmbientOcclusion" {
  SubShader "Default" {
    Pass "ScalableAmbientOcclusion" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      VertexShader = vert;
      FragmentShader = frag;

      #include "Common/BlitVertex.glsl"
      #include "AO/ScalableAmbientOcclusion.glsl"
    }

    Pass "BilateralBlur" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      VertexShader = vert;
      FragmentShader = frag;

      #include "Common/BlitVertex.glsl"
      #include "AO/BilateralBlur.glsl"
    }
  }
}
