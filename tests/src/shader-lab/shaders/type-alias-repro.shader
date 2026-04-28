Shader "type-alias-repro" {
  SubShader "Default" {
    Pass "0" {
      // FXAA-style portability macros: type aliases.
      // The `#define` lines themselves must not crash parsing — the routing
      // rule is "AST iff the value contains `.` member-access". Type
      // keywords as macro values now correctly stay on the legacy path.
      // (Use sites of these macros in *type position* are a separate
      // long-standing grammar limitation: `MACRO_CALL` is only accepted in
      // expression position. dev/2.0 baseline has the same limitation.)
      #define FxaaTex sampler2D
      #define FxaaFloat2 vec2
      #define FxaaFloat4 vec4
      #define FxaaInt2 ivec2
      #define FxaaBool bool
      #define FxaaFloat float

      VertexShader = vert;
      FragmentShader = frag;

      struct Attributes { vec4 POSITION; };
      struct Varyings { vec2 v_uv; };

      Varyings vert(Attributes a) {
        Varyings o;
        gl_Position = a.POSITION;
        o.v_uv = vec2(0.0);
        return o;
      }

      void frag(Varyings v) {
        gl_FragColor = vec4(0.0);
      }
    }
  }
}
