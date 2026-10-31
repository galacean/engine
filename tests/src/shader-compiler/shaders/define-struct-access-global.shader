Shader "define-struct-access-global-test" {
  SubShader "Default" {
    Pass "Forward" {
      mat4 renderer_MVPMat;

      struct Attributes { vec4 POSITION; vec2 TEXCOORD_0; };
      struct Varyings { vec2 v_uv; };

      VertexShader = vert;
      FragmentShader = frag;

      sampler2D u_texture;

      // Global #define referencing entry function parameter names
      #define ATTR_POS attr.POSITION
      #define VARYING_UV o.v_uv
      #define FRAG_UV v.v_uv

      Varyings vert(Attributes attr) {
        Varyings o;
        gl_Position = renderer_MVPMat * ATTR_POS;
        VARYING_UV = attr.TEXCOORD_0;
        return o;
      }

      void frag(Varyings v) {
        gl_FragColor = texture2D(u_texture, FRAG_UV);
      }
    }
  }
}
