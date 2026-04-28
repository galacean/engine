Shader "define-multiline-params" {
  SubShader "Default" {
    Pass "Forward" {
      struct Attributes { vec4 POSITION; };
      struct Varyings { vec4 pos; };

      VertexShader = vert;
      FragmentShader = frag;

      // `\` + `\n` inside a function-like macro header must collapse
      // logically. Previously `_scanUtilBreakLine` cut the directive at the
      // first `\n`, leaving `a, b, c \\\n ) max(...)` as stray top-level
      // tokens, and `_scanMacroDefineParams` (when reached) would push raw
      // `\` `\n` into the params lexeme. Fix: both routines now honor C/GLSL
      // line continuation.
      #define MAX3( \
                a, b, c \
              ) max(max(a, b), c)

      Varyings vert(Attributes a) {
        Varyings o;
        o.pos = a.POSITION;
        return o;
      }

      void frag(Varyings v) {
        float x = MAX3(v.pos.x, v.pos.y, v.pos.z);
        gl_FragColor = vec4(x);
      }
    }
  }
}
