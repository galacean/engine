Shader "define-branch-scoped-ast" {
  SubShader "Default" {
    Pass "0" {
      // Both branches are AST-form but reference different struct members.
      // The call site sits inside `#ifdef USE_NORMAL`'s `#else`, so per-branch
      // filtering must keep only the `v.v_tangent` entry — without filtering,
      // codegen could pick `v.v_normal` and emit wrong member access.
      #ifdef USE_NORMAL
        #define DIR_INPUT v.v_normal
      #else
        #define DIR_INPUT v.v_tangent
      #endif

      VertexShader = vert;
      FragmentShader = frag;

      struct Attributes { vec4 POSITION; vec3 NORMAL; vec3 TANGENT; };
      struct Varyings   { vec3 v_normal; vec3 v_tangent; };

      Varyings vert(Attributes a) {
        Varyings o;
        gl_Position = a.POSITION;
        o.v_normal = a.NORMAL;
        o.v_tangent = a.TANGENT;
        return o;
      }

      void frag(Varyings v) {
        #ifdef USE_NORMAL
          vec3 dir = normalize(DIR_INPUT);
        #else
          vec3 dir = normalize(DIR_INPUT);
        #endif
        gl_FragColor = vec4(dir, 1.0);
      }
    }
  }
}
