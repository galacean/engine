Shader "define-nested-ifdef" {
  SubShader "Default" {
    Pass "0" {
      // Nested `#ifdef` exercises the branch stack: a `#define` registered
      // under `[A=true, B=true]` must not collide with one registered under
      // `[A=true, B=false]`. The call site under `[A=true, B=false]` should
      // see only the second definition.
      #ifdef USE_A
        #ifdef USE_B
          #define VALUE 1.0
        #else
          #define VALUE 2.0
        #endif
      #else
        #define VALUE 3.0
      #endif

      VertexShader = vert;
      FragmentShader = frag;

      struct Attributes { vec4 POSITION; };
      struct Varyings { float pad; };

      Varyings vert(Attributes a) {
        Varyings o;
        gl_Position = a.POSITION;
        o.pad = 0.0;
        return o;
      }

      void frag(Varyings v) {
        float x = VALUE;
        gl_FragColor = vec4(x, 0.0, 0.0, 1.0);
      }
    }
  }
}
