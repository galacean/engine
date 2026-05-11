Shader "paren-member-access-repro" {
  SubShader "Default" {
    Pass "0" {
      // Two interlocked bugs (this PR + baseline):
      //   1. `_defineHasValue` only treats `.` as member-access when its
      //      left-side run starts with alpha — wrongly excludes `(v).v_uv`,
      //      `v . v_uv`, `((v)).v_uv` etc.
      //   2. `AssignmentExpression.semanticAnalyze` was wrapped in
      //      `// #if _VERBOSE`, so type propagation was stripped in release
      //      builds and outer `(expr).field` codegen saw `TypeAny`,
      //      skipping varying flatten.
      // Fix routes by "anything except `digit.digit`" + restores
      // type propagation in release.
      #define UV_PAREN  (v).v_uv
      #define UV_SPACE  v . v_uv

      VertexShader = vert;
      FragmentShader = frag;

      struct Attributes { vec4 POSITION; vec2 TEXCOORD_0; };
      struct Varyings { vec2 v_uv; };

      Varyings vert(Attributes a) {
        Varyings o;
        gl_Position = a.POSITION;
        o.v_uv = a.TEXCOORD_0;
        return o;
      }

      void frag(Varyings v) {
        // Inline forms.
        vec2 a = (v).v_uv;
        vec2 b = v . v_uv;
        vec2 c = ((v)).v_uv;
        // Macro forms — must flatten through the AST path.
        gl_FragColor = vec4(a + b + c + UV_PAREN + UV_SPACE, 0.0, 1.0);
      }
    }
  }
}
