Shader "macro-call-struct-arg-repro" {
  SubShader "Default" {
    Pass "Forward" {
      struct Attributes { vec4 POSITION; };
      struct Varyings { vec3 v_normal; };

      VertexShader = vert;
      FragmentShader = frag;

      // Function-like macro whose body doesn't use struct-member access.
      // Legacy path (body starts with `max`, which is not a keyword → body
      // is a non-keyword identifier → AST path).
      #define MAX3(a, b, c) max(max(a, b), c)

      Varyings vert(Attributes a) {
        Varyings o;
        gl_Position = a.POSITION;
        o.v_normal = vec3(0.0, 1.0, 0.0);
        return o;
      }

      void frag(Varyings v) {
        // Struct-member access as macro arg — each `v.v_normal.x/y/z` arg
        // unwraps to the root identifier `v` (which is a varying struct var).
        // The arg should be preserved; filter mistakenly drops it.
        float m = MAX3(v.v_normal.x, v.v_normal.y, v.v_normal.z);
        gl_FragColor = vec4(m);
      }
    }
  }
}
