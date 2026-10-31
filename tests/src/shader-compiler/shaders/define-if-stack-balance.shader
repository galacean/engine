Shader "define-if-stack-balance" {
  SubShader "Default" {
    Pass "Forward" {
      VertexShader = vert;
      FragmentShader = frag;

      struct Attributes { vec4 POSITION; vec2 TEXCOORD_0; };
      struct Varyings   { vec2 v_uv; };

      // `#if expr` and `#elif` must keep the branch-stack depth correct so a
      // matching `#endif` pops the right level. Before the fix, neither
      // `MACRO_IF` nor `MACRO_ELIF` had a stack case in `tokenize`'s switch:
      // `#if FOO ... #endif` left the stack unchanged at the open and popped
      // the outer `#ifdef A` at the close. Any `#define` after the inner
      // `#endif` was then registered with an empty branch signature instead
      // of `[A=true]`, breaking per-branch visibility.
      //
      // Real shaders nest these constantly (Fog.glsl: `#if SCENE_FOG_MODE != 0`
      // wrapping `#if SCENE_FOG_MODE == 1`; BlendShape.glsl chains of
      // `#if defined(...)`).
      #ifdef USE_A
        #if SCENE_FOG_MODE != 0
        #endif
        #define INNER_X v.v_uv
      #endif

      #ifdef USE_B
        #if FOO
          #define BR_F 1.0
        #elif BAR
          #define BR_G 2.0
        #endif
        #define OUTER_B 3.0
      #endif

      Varyings vert(Attributes a) {
        Varyings o;
        gl_Position = a.POSITION;
        o.v_uv = a.TEXCOORD_0;
        return o;
      }

      void frag(Varyings v) {
        // Both branches default-inactive: macros must compile away under
        // driver text-substitution. The point of this fixture is the
        // shader-lab side — making sure the stack stays balanced.
        gl_FragColor = vec4(v.v_uv, 0.0, 1.0);
      }
    }
  }
}
