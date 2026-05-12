Shader "define-comment-with-dot" {
  SubShader "Default" {
    Pass "Forward" {
      struct Attributes { vec4 POSITION; };
      struct Varyings { vec4 pos; };

      VertexShader = vert;
      FragmentShader = frag;

      // Reviewer P1-1: `_defineHasValue` previously scanned for `.` in raw
      // source without honoring comments. A `.` inside a block comment
      // wrongly routed the directive to the AST path, where `highp` is not
      // a valid expression starter — directive parse failed.
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
