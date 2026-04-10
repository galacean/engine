Shader "PostProcess/FinalSRGB" {
  SubShader "Default" {
    Pass "0" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      VertexShader = vert;
      FragmentShader = frag;

      #include "Common/BlitVertex.glsl"
      #include "PostProcess/FinalSRGB.glsl"
    }
  }
}
