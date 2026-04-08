Shader "SpriteMask" {
  SubShader "Default" {
    Pass "Default" {
      Tags { pipelineStage = "Forward" }

      VertexShader = SpriteMaskVertex;
      FragmentShader = SpriteMaskFragment;

      struct a2v {
        vec3 POSITION;
        vec2 TEXCOORD_0;
      };

      struct v2f {
        vec2 v_uv;
      };

      mat4 camera_VPMat;
      sampler2D renderer_MaskTexture;
      float renderer_MaskAlphaCutoff;

      v2f SpriteMaskVertex(a2v attr) {
        v2f v;
        gl_Position = camera_VPMat * vec4(attr.POSITION, 1.0);
        v.v_uv = attr.TEXCOORD_0;
        return v;
      }

      void SpriteMaskFragment(v2f v) {
        vec4 color = texture2D(renderer_MaskTexture, v.v_uv);
        if (color.a < renderer_MaskAlphaCutoff) {
          discard;
        }
        gl_FragColor = color;
      }
    }
  }
}
