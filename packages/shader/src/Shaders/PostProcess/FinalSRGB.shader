Shader "PostProcess/FinalSRGB" {
  SubShader "Default" {
    Pass "0" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      VertexShader = vert;
      FragmentShader = frag;

      #include "ShaderLibrary/Blit/BlitVertex.glsl"
      #include "ShaderLibrary/PostProcess/FinalSRGB.glsl"
    }
  }
}
