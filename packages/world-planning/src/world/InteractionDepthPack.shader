Shader "SeedWorld/InteractionDepthPack" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }
      DepthState = { Enabled = false; WriteEnabled = false; }
      BlendState = { Enabled = false; }
      VertexShader = vert;
      FragmentShader = frag;
      #include "ShaderLibrary/Blit/BlitVertex.glsl"
      highp sampler2D renderer_BlitTexture;
      vec4 material_InteractionUVs[16];
      void frag(Varyings v) {
        vec2 uv = material_InteractionUVs[int(gl_FragCoord.x)].xy;
        // Clamp after rounding: float32 rounds 16777215 + 0.5 up to 2^24.
        // The all-ones code must remain the clear-depth (no occluder) sentinel.
        float code = min(16777215.0, floor(texture2D(renderer_BlitTexture, uv).r * 16777215.0 + 0.5));
        gl_FragColor = vec4(mod(code, 256.0), mod(floor(code / 256.0), 256.0), floor(code / 65536.0), 255.0) / 255.0;
      }
    }
  }
}
