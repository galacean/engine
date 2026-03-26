Shader "define-struct-access-test" {
  SubShader "Default" {
    Pass "Forward" {
      mat4 renderer_MVPMat;

      struct Attributes { vec4 POSITION; vec2 TEXCOORD_0; };
      struct Varyings { vec2 v_uv; };

      VertexShader = vert;
      FragmentShader = frag;

      sampler2D u_texture;

      Varyings vert(Attributes attr) {
        Varyings o;
        #define ATTR_POS attr.POSITION
        #define VARYING_UV o.v_uv
        gl_Position = renderer_MVPMat * ATTR_POS;
        VARYING_UV = attr.TEXCOORD_0;
        return o;
      }

      void frag(Varyings v) {
        #define FRAG_UV v.v_uv
        gl_FragColor = texture(u_texture, FRAG_UV);
      }
    }
  }
}
