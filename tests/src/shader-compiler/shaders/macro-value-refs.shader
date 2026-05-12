Shader "macro-value-refs" {
  SubShader "Default" {
    Pass "test" {
      mat4 renderer_MVPMat;

      // 1) Binary operator — old regex anchored `^id(...)?$`, no trailing operand.
      #define V_OP u_op_a + u_op_b
      // 2) Fn call — old regex captured `mix` only, missed user args.
      #define V_FN mix(u_fn_a, u_fn_b, 0.5)
      // 3) Unary — old regex failed on leading `-`.
      #define V_UNARY -u_unary
      // 4) `SkyProcedural`'s `#define RAYLEIGH …` shape — real-world repro.
      #define V_SKY (mix(0.0, 0.0025, pow(material_AtmosphereThickness, 2.5)))

      // Declarations after the #defines — exercises lazy lookup at call site.
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
        float v = V_OP + V_FN + V_UNARY + V_SKY;
        gl_FragColor = vec4(v, 0.0, 0.0, 1.0);
      }

      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}
