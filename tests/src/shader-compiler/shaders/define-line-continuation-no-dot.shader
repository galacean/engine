Shader "define-line-continuation-no-dot" {
  SubShader "Default" {
    Pass "Forward" {
      struct Attributes { vec4 POSITION; vec2 TEXCOORD_0; };
      struct Varyings { vec2 v_uv; };

      VertexShader = vert;
      FragmentShader = frag;

      // `_defineDirectiveReg`'s value group rejected newlines, so a directive
      // text slice that still contained `\` + `\n` would NO MATCH the regex
      // and registration silently skipped. The macro then leaked into the
      // fragment as an unidentified ID, raising spurious "v not declared"
      // warnings during semantic analysis. Fix folds the line continuation
      // before the match.
      #define LONG_VAL  v.v_uv \
                      + v.v_uv

      Varyings vert(Attributes a) {
        Varyings o;
        gl_Position = a.POSITION;
        o.v_uv = a.TEXCOORD_0;
        return o;
      }

      void frag(Varyings v) {
        gl_FragColor = vec4(LONG_VAL, 0.0, 1.0);
      }
    }
  }
}
