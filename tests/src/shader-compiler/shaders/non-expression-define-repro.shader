Shader "non-expression-define-repro" {
  SubShader "Default" {
    Pass "Forward" {
      struct Attributes { vec4 POSITION; };
      struct Varyings { vec4 pos; };

      VertexShader = vert;
      FragmentShader = frag;

      // GLSL ES 3.00 §3.4: the `#define` replacement list is an arbitrary
      // token sequence — not necessarily a valid expression. These macro
      // definitions must be accepted (opaque path); whether they can be
      // called in non-expression positions is a separate concern.
      #define PAREN (
      #define CLOSE_PAREN )
      #define NEG_ONE_COMMA -1.0,

      // Sanity: the shader still parses even when these macros are defined
      // but not invoked in non-expression positions. Baseline accepts this.
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
