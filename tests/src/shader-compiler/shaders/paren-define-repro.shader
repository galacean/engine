Shader "paren-define-repro" {
  SubShader "Default" {
    Pass "Forward" {
      struct Attributes { vec4 POSITION; };
      struct Varyings { vec4 pos; };

      VertexShader = vert;
      FragmentShader = frag;

      // Per C99 §6.10.3/3 and GLSL ES 3.00 §3.4 (mirrors C preprocessor):
      //   `#define NAME (...)` — space before `(` → object-like macro, value is `(...)`
      //   `#define NAME(...)` — no space → function-like macro, params is `(...)`
      // Both forms must parse correctly.

      // Object-like: space before `(`, value is `(1 + 2)`.
      #define OBJ_PAREN (1 + 2)

      // Function-like: no space, params is `(x)`, body is `x + 3.0`.
      #define FN_LIKE(x) (x + 3.0)

      Varyings vert(Attributes a) {
        Varyings o;
        o.pos = a.POSITION * float(OBJ_PAREN) * FN_LIKE(1.0);
        return o;
      }

      void frag(Varyings v) {
        gl_FragColor = v.pos;
      }
    }
  }
}
