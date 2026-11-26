Shader "Lighting/ProbeDepthCapture" {
  SubShader "Default" {
    Pass "Forward" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      VertexShader = vert;
      FragmentShader = frag;

      #include "ShaderLibrary/Blit/BlitVertex.glsl"
      #include "ShaderLibrary/Common/Common.glsl"

      highp sampler2D renderer_BlitTexture;

      void frag(Varyings v) {
        float depth = texture2D(renderer_BlitTexture, v.v_uv).r;
        gl_FragColor = vec4(remapDepthBufferEyeDepth(depth), 0.0, 0.0, 1.0);
      }
    }
  }
}
