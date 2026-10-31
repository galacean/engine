Shader "macro-value-refs" {
  SubShader "Default" {
    Pass "test" {
      mat4 renderer_MVPMat;

      // 1) Parenthesized — pre-fix `_defineDirectiveReg` mis-classified this
      //    as function-like `V_PAREN(u_paren)` with empty value.
      #define V_PAREN (u_paren)
      // 2) Binary operator — old regex anchored `^id(...)?$`, no trailing operand.
      #define V_OP u_op_a + u_op_b
      // 3) Fn call — old regex captured `mix` only, missed user args.
      #define V_FN mix(u_fn_a, u_fn_b, 0.5)
      // 4) Unary — old regex failed on leading `-`.
      #define V_UNARY -u_unary
      // 5) `SkyProcedural`'s `#define RAYLEIGH …` shape — real-world repro.
      #define V_SKY (mix(0.0, 0.0025, pow(material_AtmosphereThickness, 2.5)))

      // Declarations after the #defines — exercises lazy lookup at call site.
      float u_paren;
      float u_op_a;
      float u_op_b;
      float u_fn_a;
      float u_fn_b;
      float u_unary;
      float material_AtmosphereThickness;

      struct Attributes { vec3 POSITION; };

      void vert(Attributes attr) {
        gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0);
      }

      void frag() {
        float v = V_PAREN + V_OP + V_FN + V_UNARY + V_SKY;
        gl_FragColor = vec4(v, 0.0, 0.0, 1.0);
      }

      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}
