Shader "macro-callee-kinds" {
  SubShader "Default" {
    Pass "test" {
      mat4 renderer_MVPMat;

      // Object-like macros covering the three callee kinds the visitor must
      // distinguish at a `K(args)` call site (LALR enforces shift to
      // `macro_call_function`, so this exercises the resulting visitor):

      // (1) builtin type alias — constructor call, no formal flattening
      #define MyVec3 vec3
      // (2) builtin function alias — args are values, no flattening
      #define MyMix mix
      // (3) user-declared function alias — formals flattened, bare IO-struct
      //     args must be dropped to match flattened signature
      #define MyHelper computeColor

      struct Attributes { vec3 POSITION; };

      // helper used via macro alias `MyHelper`; its only formal is an IO struct,
      // so it gets flattened away and its body reads `POSITION.xyz` directly.
      vec3 computeColor(Attributes a) {
        return a.POSITION.xyz;
      }

      void vert(Attributes attr) {
        // (1) builtin type via member access — args must be preserved
        vec3 v_member = MyVec3(attr.POSITION.x, attr.POSITION.y, attr.POSITION.z);
        // (1) builtin type via literals — args must be preserved
        vec3 v_literal = MyVec3(0.1, 0.2, 0.3);
        // (2) builtin fn alias — args must be preserved verbatim
        vec3 v_mix = MyMix(v_member, v_literal, 0.5);
        // (3) user-fn alias with bare IO struct — formal-paired, MUST be
        //     dropped so codegen emits `MyHelper()` matching flattened decl
        vec3 v_user = MyHelper(attr);

        gl_Position = renderer_MVPMat * vec4(v_member + v_literal + v_mix + v_user, 1.0);
      }

      void frag() { gl_FragColor = vec4(1.0); }

      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}
