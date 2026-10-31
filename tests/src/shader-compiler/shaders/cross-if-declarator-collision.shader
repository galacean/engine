Shader "cross-if-declarator-collision" {
  SubShader "Default" {
    Pass "Forward" {
      VertexShader = vert;
      FragmentShader = frag;

      struct Attributes { vec4 POSITION; };
      struct Varyings   { vec4 v_color; };

      // FXAA-style cross-#if name shadowing: a `#define` in one arm and a
      // matching variable declaration in the mutually-exclusive arm.
      // Semantically legal under ShaderLab's lazy preprocessor — only one
      // arm activates per macro state, so codegen never emits a
      // `float NUMBER = …;` collision.
      //
      // Lexer can't statically evaluate `#if expr`, so it conservatively
      // tags `lumaS` in the #else arm as MACRO_CALL (the #define in the
      // sibling arm is "potentially visible" — branch-mutex is exact only
      // for `#ifdef`/`#ifndef` pairs). Grammar
      //   single_declaration → fully_specified_type MACRO_CALL [= initializer]
      // (added in 87cb2b5f0) accepts the resulting `float MACRO_CALL = …;`
      // token stream so parsing succeeds.
      //
      // Codegen must then keep the #else-arm declaration in the emitted
      // GLSL — without it, any later use of `lumaS` references an
      // undeclared identifier and the WebGL driver rejects the variant
      // where the #if condition is false.
      #if FXAA_GATHER4_ALPHA == 1
        #define lumaS 1.0
      #else
        float lumaS = 0.5;
      #endif

      Varyings vert(Attributes a) {
        Varyings o;
        gl_Position = a.POSITION;
        // Reference `lumaS` so codegen has a reason to keep the #else
        // declaration. Lexer also tags this `lumaS` as MACRO_CALL (the
        // sibling-arm `#define` is potentially visible from here too) —
        // so the global-decl emitter can't rely on the "ID reference →
        // global var" path; it must also follow MACRO_CALL references
        // back to a same-name declaration in a sibling #if arm.
        o.v_color = vec4(lumaS, lumaS, lumaS, 1.0);
        return o;
      }

      void frag(Varyings v) {
        gl_FragColor = v.v_color;
      }
    }
  }
}
