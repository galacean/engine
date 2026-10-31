Shader "define-comment-with-dot" {
  SubShader "Default" {
    Pass "Forward" {
      struct Attributes { vec4 POSITION; };
      struct Varyings { vec4 pos; };

      VertexShader = vert;
      FragmentShader = frag;

      // Dots inside comments do not make a declaration-style replacement list an expression.
      #define HP /* a.b */ highp

      Varyings vert(Attributes a) {
        Varyings o;
        o.pos = a.POSITION;
        return o;
      }

      void frag(Varyings v) {
        gl_FragColor = v.pos;
      }
    }
  }
}
