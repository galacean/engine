Shader "SeedWorld/PhotoCopy" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }
      DepthState = { Enabled = false; WriteEnabled = false; }
      VertexShader = vert;
      FragmentShader = frag;
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Blit/BlitVertex.glsl"
      sampler2D renderer_BlitTexture;
      void frag(Varyings v) {
        vec4 encoded = texture2D(renderer_BlitTexture, v.v_uv);
        gl_FragColor = vec4(sRGBToLinear(encoded).rgb, 1.0);
      }
    }
  }
}
