Shader "define-in-comment-repro" {
  SubShader "Default" {
    Pass "0" {
      // Directives inside block comments must not register macros.
      // Fix: regex runs on a comment-stripped source.
      /*
       * Documentation:
       * #define MAX_LIGHTS 4
       */

      // Real define, the only one that should actually register:
      #define MAX_LIGHTS 8

      VertexShader = vert;
      FragmentShader = frag;

      struct Attributes { vec4 POSITION; };
      struct Varyings { vec2 v_uv; };

      Varyings vert(Attributes a) {
        Varyings o;
        gl_Position = a.POSITION;
        o.v_uv = vec2(0.0);
        return o;
      }

      void frag(Varyings v) {
        int x = MAX_LIGHTS;
        gl_FragColor = vec4(float(x) / 8.0, 0.0, 0.0, 1.0);
      }
    }
  }
}
