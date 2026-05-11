Shader "define-comment-in-peek" {
  SubShader "Default" {
    Pass "Forward" {
      struct Attributes { vec4 POSITION; };
      struct Varyings { vec4 pos; };

      VertexShader = vert;
      FragmentShader = frag;

      // Warning 1 from CR: `_defineHasValue` skips only spaces/tabs before
      // the keyword-peek. If the value starts with a block comment, the
      // first-char check `isAlpha` sees `/`, bypasses the keyword whitelist,
      // and routes to AST. Parser then fails because `highp` is not a valid
      // expression starter. Baseline treats the entire directive as opaque
      // and the comment is transparent to the driver.
      #define HP /* comment */ highp

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
