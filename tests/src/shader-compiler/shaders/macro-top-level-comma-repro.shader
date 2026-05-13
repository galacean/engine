Shader "macro-top-level-comma-repro" {
  SubShader "Default" {
    Pass "test" {
      mat4 renderer_MVPMat;

      // GLSL ES 3.00 §3.4 + C99 §6.10.3: a `#define` replacement list is an
      // arbitrary token sequence. A top-level `,` is legal — the macro can be
      // expanded into a comma-separated argument list. The grammar's
      // `macro_define` value position only accepts `assignment_expression`
      // (not `expression`), so this shape must route to the legacy opaque
      // path, not the AST path.
      #define ARGS u_arg_a, u_arg_b, u_arg_c
      // Trailing top-level comma — already covered, asserted here for breadth
      #define ARGS_TRAIL u_arg_a, u_arg_b,

      float u_arg_a;
      float u_arg_b;
      float u_arg_c;

      struct Attributes { vec3 POSITION; };

      void vert(Attributes attr) {
        gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0);
      }

      void frag() {
        // The macros are defined but not invoked in a position the parser
        // would accept (GLSL function call positions need real expressions).
        // Sanity: the shader still compiles.
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      }

      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}
