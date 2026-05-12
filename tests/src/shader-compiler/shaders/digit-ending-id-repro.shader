Shader "digit-ending-id-repro" {
  SubShader "Default" {
    Pass "0" {
      // Regression: `_defineHasValue` previously checked only the single char
      // before `.` to skip decimal points (`3.14`). But GLSL identifiers can
      // end in digits (`v0`, `uv1`, `pos2D`), so `v.uv1.xy` and similar
      // member-access via digit-ending fields were mis-routed to legacy and
      // never got varying-flatten rewriting.
      //
      // Fix: walk back the entire alnum/_ run; member-access only when the
      // run starts with alpha or `_`.
      #define UV0  v.uv0.xy
      #define UV1  v.uv1.xy
      #define POS  v.pos2D

      VertexShader = vert;
      FragmentShader = frag;

      struct Attributes { vec4 POSITION; };
      struct Varyings { vec2 uv0; vec2 uv1; vec2 pos2D; };

      Varyings vert(Attributes a) {
        Varyings o;
        gl_Position = a.POSITION;
        o.uv0 = vec2(0.0);
        o.uv1 = vec2(0.0);
        o.pos2D = vec2(0.0);
        return o;
      }

      void frag(Varyings v) {
        gl_FragColor = vec4(UV0 + UV1, POS.x, 1.0);
      }
    }
  }
}
