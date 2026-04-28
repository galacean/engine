Shader "define-elif-polarity" {
  SubShader "Default" {
    Pass "Forward" {
      VertexShader = vert;
      FragmentShader = frag;

      struct Attributes { vec4 POSITION; };
      struct Varyings   { vec2 v_uv; };

      // `#elif` is semantically `#else + #if`: the new arm is active when
      // no prior arm held *and* the elif condition holds. Without a stack
      // case, the `#elif` arm inherits the previous arm's branch tag —
      // exactly the *opposite* of where it's active. Engine shader pattern
      // `#ifdef RENDERER_HAS_NORMAL / ... / #elif defined(HAS_DERIVATIVES)`
      // (FragmentPBR.glsl:188) would silently mistag any `#define` inside
      // the `#elif` arm with `RENDERER_HAS_NORMAL=true` semantics.
      //
      // Flipping polarity (like `#else` does) only works for the first
      // `#elif` of a chain; longer chains (`#ifdef A / #elif B / #elif C`)
      // would ping-pong polarity. Degrading the top constraint to a
      // sentinel (`name === ""`) is uniformly conservative — drops
      // polarity precision but never wrongly inherits.
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
