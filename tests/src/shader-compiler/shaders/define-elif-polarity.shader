Shader "define-elif-polarity" {
  SubShader "Default" {
    Pass "Forward" {
      VertexShader = vert;
      FragmentShader = frag;

      struct Attributes { vec4 POSITION; };
      struct Varyings   { vec2 v_uv; };

      // Each `#elif` arm carries its own condition plus the negated prior arms.
      #ifdef USE_BR_A
        #define ARM_A 1
      #elif defined(USE_BR_B)
        #define ARM_B 2
      #elif defined(USE_BR_C)
        #define ARM_C 3
      #endif

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
