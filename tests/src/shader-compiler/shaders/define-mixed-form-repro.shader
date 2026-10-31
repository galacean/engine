Shader "define-mixed-form-repro" {
  SubShader "Default" {
    Pass "0" {
      // Issue #2980 nit: same `#define` name with different forms across
      // `#ifdef` branches is legal GLSL (preprocessor is text replacement;
      // each active branch produces a self-consistent program). The shader
      // compiler must not pollute the call site with TypeAny — it should fall back
      // to legacy `referenceSymbolNames`-based inference whichever branch
      // is active.
      #ifdef USE_AST_FORM
        #define LIGHT_INPUT v.v_normal
      #else
        #define LIGHT_INPUT u_globalLightDir
      #endif

      VertexShader = vert;
      FragmentShader = frag;

      struct Attributes { vec4 POSITION; vec3 NORMAL; };
      struct Varyings   { vec3 v_normal; };

      vec3 u_globalLightDir;

      Varyings vert(Attributes a) {
        Varyings o;
        gl_Position = a.POSITION;
        o.v_normal = a.NORMAL;
        return o;
      }

      void frag(Varyings v) {
        vec3 dir = normalize(LIGHT_INPUT);
        gl_FragColor = vec4(dir, 1.0);
      }
    }
  }
}
