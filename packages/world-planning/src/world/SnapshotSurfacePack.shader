Shader "SeedWorld/SnapshotSurfacePack" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }
      DepthState = { Enabled = false; WriteEnabled = false; }
      BlendState = { Enabled = false; }
      VertexShader = vert;
      FragmentShader = frag;
      #include "ShaderLibrary/Blit/BlitVertex.glsl"
      sampler2D renderer_BlitTexture;
      highp sampler2D material_SurfaceDepth;
      mat4 material_InverseProjection;
      vec4 material_SurfaceViewport;
      // near, far, inverse log2(far / near), max depth code
      vec4 material_SurfaceEncoding;
      vec4 material_DepthByteScale;
      void frag(Varyings v) {
        vec3 bytes = floor(texture2D(renderer_BlitTexture, v.v_uv).rgb * 255.0 + 0.5);
        float id = dot(bytes, vec3(1.0, 256.0, 65536.0));
        float depth = texture2D(material_SurfaceDepth, v.v_uv).r;
        vec2 local = (v.v_uv - material_SurfaceViewport.xy) / material_SurfaceViewport.zw;
        vec4 eye = material_InverseProjection * vec4(local.x * 2.0 - 1.0, 1.0 - local.y * 2.0, depth * 2.0 - 1.0, 1.0);
        float linearDepth = -eye.z / eye.w;
        float code = floor(clamp(log2(clamp(linearDepth, material_SurfaceEncoding.x, material_SurfaceEncoding.y) /
          material_SurfaceEncoding.x) * material_SurfaceEncoding.z, 0.0, 1.0) * material_SurfaceEncoding.w + 0.5);
        // Low identity-only bytes have zero depth scale. Every intermediate integer stays below 2^24.
        vec4 identityBytes = vec4(bytes, 0.0);
        vec4 depthBytes = mod(floor(code * material_DepthByteScale), 256.0);
        gl_FragColor = id < 0.5 ? vec4(0.0) : (identityBytes + depthBytes) / 255.0;
      }
    }
  }
}
